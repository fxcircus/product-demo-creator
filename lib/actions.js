// Beat actions. Click targets are resolved by VISIBLE TEXT / ARIA role first
// (stable across app refactors), with a CSS-selector escape hatch for the rare
// unlabeled control. A target that can't be found logs a warning and is
// skipped — the recording keeps rolling and the miss is reported at the end.
import { log } from './util.js';

const FIND_TIMEOUT_MS = 4000;   // total budget to find a target
const POLL_MS = 250;
const ACTION_VERBS = ['click', 'hold', 'wait', 'press', 'showCard', 'hideCard'];

/** Human-readable name of a target, for logs. */
export function targetName(target) {
  if (typeof target === 'string') return target;
  if (target.selector) return target.selector;
  if (target.role) return `${target.role} "${target.name}"`;
  return JSON.stringify(target);
}

/**
 * Build the ordered list of candidate locators for a target within a root
 * (page or frame). Each entry carries `exact` — exact matches always beat the
 * starts-with fallback, which exists for labels that carry a suffix in the
 * same node (e.g. a keyboard-shortcut cap). Never bare substring: substring
 * matching once resolved "LP" to an "About & heLP" button.
 */
function candidatesFor(root, target) {
  if (typeof target === 'string') {
    const prefix = new RegExp('^' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return [
      { loc: root.getByRole('button', { name: target, exact: true }), exact: true },
      { loc: root.getByRole('tab', { name: target, exact: true }), exact: true },
      { loc: root.getByRole('menuitem', { name: target, exact: true }), exact: true },
      { loc: root.getByRole('link', { name: target, exact: true }), exact: true },
      { loc: root.getByText(target, { exact: true }), exact: true },
      { loc: root.getByRole('button', { name: prefix }), exact: false },
      { loc: root.getByText(prefix), exact: false },
    ];
  }
  if (target.selector) return [{ loc: root.locator(target.selector), exact: true }];
  if (target.role) {
    return [{ loc: root.getByRole(target.role, { name: target.name, exact: target.exact !== false }), exact: true }];
  }
  throw new Error(`unrecognized target: ${JSON.stringify(target)}`);
}

/**
 * Resolve a target to a VISIBLE match, polling briefly so just-opened panels
 * have time to render. The main frame is searched first, then any iframes.
 *
 * Ranking among visible matches (a demo clicks what's on camera):
 *   1. exact matches beat starts-with fallbacks
 *   2. matches inside the current viewport beat off-screen ones — the same
 *      label often exists in several page sections (e.g. a "E7" lap-steel
 *      card vs an "E7" chord cell three screens away)
 *   3. earlier candidate kinds (button > tab > … > text) beat later ones
 *   4. less text wins — text engines also match ancestor containers, and the
 *      smallest element is the actual label
 */
async function resolveTarget(page, target) {
  const deadline = Date.now() + FIND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const main = page.mainFrame();
    const roots = [page, ...page.frames().filter((f) => f !== main)];
    let best = null;
    const beats = (a, b) =>
      !b ||
      (a.exact !== b.exact ? a.exact :
        a.inViewport !== b.inViewport ? a.inViewport :
          a.rank !== b.rank ? a.rank < b.rank :
            a.textLen < b.textLen);
    for (const root of roots) {
      const cands = candidatesFor(root, target);
      for (let rank = 0; rank < cands.length; rank++) {
        let matches;
        try {
          matches = await cands[rank].loc.all();
        } catch {
          continue;
        }
        for (const m of matches.slice(0, 40)) {
          const info = await m.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
            return {
              visible,
              inViewport: visible && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
              textLen: (el.textContent || '').length,
            };
          }).catch(() => null);
          if (!info?.visible) continue;
          const cand = { m, exact: cands[rank].exact, inViewport: info.inViewport, rank, textLen: info.textLen };
          if (beats(cand, best)) best = cand;
        }
      }
    }
    if (best) return best.m;
    await page.waitForTimeout(POLL_MS);
  }
  return null;
}

/** Smooth-scroll the element to view if needed, then glide the fake cursor onto it. */
async function approach(page, locator) {
  const inView = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
  }).catch(() => true);
  if (!inView) {
    await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' })).catch(() => {});
    await page.waitForTimeout(750); // let the smooth scroll finish on camera
  }
  const box = await locator.boundingBox();
  if (!box) return null;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([px, py]) => window.__demoOverlay?.cursorTo(px, py), [x, y]);
  await page.waitForTimeout(550); // cursor glide duration
  return { x, y };
}

/**
 * Perform one action object from a beat. Returns null on success or the
 * missed target's name on failure.
 */
export async function performAction(page, action) {
  const verbs = ACTION_VERBS.filter((v) => action[v] != null);
  if (verbs.length > 1) {
    log.warn(`action ${JSON.stringify(action)} has multiple verbs — running "${verbs[0]}" only; split into separate { } objects`);
  }

  // ---- non-click actions -------------------------------------------------
  if (action.wait != null) {
    await page.waitForTimeout(action.wait);
    return null;
  }
  if (action.showCard) {
    const { title, subtitle } = action.showCard;
    await page.evaluate(([t, s]) => window.__demoOverlay?.showCard(t, s), [title, subtitle]);
    return null;
  }
  if (action.hideCard) {
    await page.evaluate(() => window.__demoOverlay?.hideCard());
    return null;
  }
  if (action.press) {
    await page.keyboard.press(action.press); // e.g. 'Escape' to dismiss a stray dialog
    return null;
  }

  // ---- click / hold ------------------------------------------------------
  const target = action.click ?? action.hold;
  if (target == null) {
    log.warn(`unknown action ${JSON.stringify(action)} — skipping`);
    return null;
  }
  const name = targetName(target);
  const locator = await resolveTarget(page, target);
  if (!locator) {
    log.warn(`couldn't find "${name}" — skipping this step (recording continues)`);
    return name;
  }

  const point = await approach(page, locator);
  if (!point) {
    log.warn(`"${name}" found but not clickable (no bounding box) — skipping`);
    return name;
  }

  try {
    if (action.hold != null) {
      // press-and-hold: real pointer events so pointerdown/-up handlers fire.
      // Re-measure right before pressing — layout may have shifted during the
      // cursor glide — and do NOT move the mouse while held: apps using
      // setPointerCapture treat a capture loss as an early release.
      const box = await locator.boundingBox();
      const x = box ? box.x + box.width / 2 : point.x;
      const y = box ? box.y + box.height / 2 : point.y;
      await page.mouse.move(x, y);
      await page.evaluate(([px, py]) => window.__demoOverlay?.clickPulse(px, py), [x, y]);
      await page.mouse.down();
      await page.waitForTimeout(action.ms ?? 1500);
      await page.mouse.up();
    } else {
      await page.evaluate(([px, py]) => window.__demoOverlay?.clickPulse(px, py), [point.x, point.y]);
      await locator.click({ timeout: 3000 });
    }
    await parkMouse(page); // don't leave hover tooltips lingering on camera
    return null;
  } catch (err) {
    log.warn(`click on "${name}" failed (${err.message.split('\n')[0]}) — skipping`);
    return name;
  }
}

/** Rest the real mouse in the top-left corner so :hover tooltips clear. */
async function parkMouse(page) {
  await page.mouse.move(2, 2);
}

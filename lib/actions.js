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

/** Build the ordered list of candidate locators for a target within a root (page or frame). */
function candidatesFor(root, target) {
  if (typeof target === 'string') {
    // Exact matches first. The fallback is a STARTS-WITH regex, never a bare
    // substring: substring matching once resolved "LP" to an "About & heLP"
    // button. Starts-with still finds labels that carry a suffix in the same
    // node (e.g. a keyboard-shortcut cap rendered inside the label).
    const prefix = new RegExp('^' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return [
      root.getByRole('button', { name: target, exact: true }),
      root.getByRole('tab', { name: target, exact: true }),
      root.getByRole('menuitem', { name: target, exact: true }),
      root.getByRole('link', { name: target, exact: true }),
      root.getByText(target, { exact: true }),
      root.getByRole('button', { name: prefix }),
      root.getByText(prefix),
    ];
  }
  if (target.selector) return [root.locator(target.selector)];
  if (target.role) {
    return [root.getByRole(target.role, { name: target.name, exact: target.exact !== false })];
  }
  throw new Error(`unrecognized target: ${JSON.stringify(target)}`);
}

/**
 * Resolve a target to a VISIBLE match, polling briefly so just-opened panels
 * have time to render. The main frame is searched first, then any iframes
 * (embedded widgets/editors). Among multiple visible matches, prefer the one
 * with the least text — text/regex engines also match ancestor containers,
 * and the smallest element is the actual label. Returns null if not found.
 */
async function resolveTarget(page, target) {
  const deadline = Date.now() + FIND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const main = page.mainFrame();
    const roots = [page, ...page.frames().filter((f) => f !== main)];
    for (const root of roots) {
      for (const cand of candidatesFor(root, target)) {
        let matches;
        try {
          matches = await cand.all();
        } catch {
          continue;
        }
        let best = null;
        let bestLen = Infinity;
        for (const m of matches.slice(0, 40)) {
          if (!(await m.isVisible().catch(() => false))) continue;
          const len = await m.evaluate((el) => (el.textContent || '').length).catch(() => Infinity);
          if (len < bestLen) { best = m; bestLen = len; }
        }
        if (best) return best;
      }
    }
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

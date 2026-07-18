// `demo-maker --probe <scenes>`: open the app, list every visible clickable
// label Playwright can see, and save a screenshot. Use this when writing the
// beats for a NEW app — it tells you exactly which text labels exist before
// you guess at locators.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { log } from './util.js';

export async function probe(scenes, buildDir) {
  mkdirSync(buildDir, { recursive: true });
  const { width = 1920, height = 1080 } = scenes.video ?? {};
  const browser = await chromium.launch({ headless: true, args: ['--hide-scrollbars'] });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, bypassCSP: true });
  if (scenes.permissions?.length) {
    try { await context.grantPermissions(scenes.permissions, { origin: new URL(scenes.url).origin }); } catch {}
  }
  const page = await context.newPage();
  log.step(`● probing ${scenes.url}`);
  await page.goto(scenes.url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(scenes.settle ?? 2000);

  const { items, iframes } = await page.evaluate(() => {
    const seen = new Map();
    const consider = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
      // Approximate the accessible name the way Playwright will see it:
      // aria-label, then title/alt/value for label-less controls, then text.
      const aria = (el.getAttribute('aria-label') || '').trim();
      const attr = (el.getAttribute('title') || el.getAttribute('alt') || el.value || '').trim?.() || '';
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
      const label = aria || text || attr;
      if (!label || label.length > 48) return;
      const key = `${label}|${el.tagName}`;
      if (seen.has(key)) return;
      seen.set(key, {
        label,
        viaAria: !!aria && !text,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || (el.tagName === 'BUTTON' ? 'button' : ''),
        inViewport: r.top < innerHeight && r.bottom > 0,
      });
    };
    document
      .querySelectorAll('button, [role="button"], [role="tab"], [role="menuitem"], [role="radio"], a, [onclick], input[type="button"], input[type="submit"], select, label')
      .forEach(consider);
    for (const el of document.querySelectorAll('*')) {
      try { if (getComputedStyle(el).cursor === 'pointer') consider(el); } catch {}
    }
    const iframes = [...document.querySelectorAll('iframe')].map(
      (f) => f.src || f.title || '(inline frame)'
    );
    return { items: [...seen.values()], iframes };
  });

  const shot = path.join(buildDir, 'probe.png');
  await page.screenshot({ path: shot, fullPage: false });
  const shotFull = path.join(buildDir, 'probe-fullpage.png');
  await page.screenshot({ path: shotFull, fullPage: true });
  await browser.close();

  const fmt = (i) => `  ${i.inViewport ? '•' : '↓'} [${i.role || i.tag}] "${i.label}"${i.viaAria ? ' (aria-label)' : ''}`;
  log.info(`\nVisible clickable labels (• = in first viewport, ↓ = below the fold):`);
  items.sort((a, b) => (b.inViewport - a.inViewport) || a.label.localeCompare(b.label));
  for (const i of items) log.info(fmt(i));
  if (iframes.length) {
    log.warn(`${iframes.length} iframe(s) on the page — their inner labels are NOT listed above, but click targets inside them do resolve at record time: ${iframes.slice(0, 5).join(', ')}`);
  }
  log.ok(`\n● screenshots: ${shot} (viewport), ${shotFull} (full page)`);
  return { items, iframes, shot, shotFull };
}

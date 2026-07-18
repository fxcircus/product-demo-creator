// The recording pass: open the URL in Chromium with Playwright's built-in
// recordVideo, walk the beats, and capture a timeline of when each beat
// actually started/ended (relative to video start) so narration and the
// summary line up with the pixels.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { performAction } from './actions.js';
import { OVERLAY_INSTALL } from './overlay.js';
import { log } from './util.js';

export async function record(scenes, narrations, buildDir) {
  const { width = 1920, height = 1080 } = scenes.video ?? {};
  mkdirSync(buildDir, { recursive: true });

  const browser = await chromium.launch({
    headless: scenes.headed ? false : true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    recordVideo: { dir: buildDir, size: { width, height } },
    bypassCSP: true, // strict-CSP apps would otherwise block the injected overlay <style>
  });
  // Init script: the overlay re-installs itself if a beat's click navigates
  // to a new document (it is idempotent; see overlay.js).
  await context.addInitScript(OVERLAY_INSTALL);

  // Grant whatever the app wants (e.g. Web MIDI) so no permission prompt
  // ever appears on camera. Failures are fine — not every app needs any.
  if (scenes.permissions?.length) {
    try {
      await context.grantPermissions(scenes.permissions, { origin: new URL(scenes.url).origin });
    } catch (err) {
      log.warn(`could not grant permissions ${scenes.permissions.join(', ')}: ${err.message.split('\n')[0]}`);
    }
  }

  const page = await context.newPage();
  const t0 = Date.now(); // video recording starts with page creation
  const now = () => (Date.now() - t0) / 1000;

  const timeline = [];
  const misses = [];
  let videoPath = null;

  try {
    log.step(`● recording ${scenes.url}`);
    await page.goto(scenes.url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(scenes.settle ?? 2000); // let fonts/first paint settle
    await page.evaluate(OVERLAY_INSTALL);

    const defaults = { minHold: 3.0, tailPad: 0.9, ...(scenes.defaults ?? {}) };

    for (let i = 0; i < scenes.beats.length; i++) {
      const beat = scenes.beats[i];
      const narr = narrations.get(i) ?? null;
      const hold = Math.max(
        beat.minHold ?? defaults.minHold,
        narr ? narr.duration + (beat.tailPad ?? defaults.tailPad) : 0
      );
      log.info(`  ▶ beat ${i + 1}/${scenes.beats.length} — hold ${hold.toFixed(1)}s${beat.caption ? ` — “${beat.caption}”` : ''}`);

      const tStart = now();
      if (beat.caption) {
        await page.evaluate((text) => window.__demoOverlay?.showCaption(text), beat.caption);
      } else {
        await page.evaluate(() => window.__demoOverlay?.hideCaption());
      }

      for (const action of beat.actions ?? []) {
        const missed = await performAction(page, action);
        if (missed) misses.push({ beat: i + 1, target: missed });
      }

      // Hold the shot until the narration (plus breathing room) would finish.
      const remaining = hold - (now() - tStart);
      if (remaining > 0) await page.waitForTimeout(remaining * 1000);

      timeline.push({ index: i, caption: beat.caption ?? null, tStart, tEnd: now(), narr });
    }

    await page.waitForTimeout(800); // don't cut the last frame short
  } finally {
    const elapsed = now();
    const video = page.video();
    try {
      await context.close(); // flushes the video file
    } catch (err) {
      log.warn(`context close: ${err.message.split('\n')[0]}`);
    }
    try {
      await browser.close();
    } catch (err) {
      log.warn(`browser close: ${err.message.split('\n')[0]}`);
    }
    if (video) videoPath = await video.path().catch(() => null);
    if (videoPath) log.ok(`● recorded ${elapsed.toFixed(1)}s of video → ${videoPath}`);
  }

  if (!videoPath) throw new Error('Playwright did not produce a video file');
  return { videoPath, timeline, misses, measuredDuration: (Date.now() - t0) / 1000 };
}

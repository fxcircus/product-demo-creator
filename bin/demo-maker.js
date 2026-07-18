#!/usr/bin/env node
// demo-maker — turn a live web app into a narrated, captioned demo video.
//
//   node bin/demo-maker.js scenes/vg800.js          record + narrate + encode
//   node bin/demo-maker.js --probe scenes/vg800.js  list clickable labels + screenshot
//   node bin/demo-maker.js --headed scenes/vg800.js watch the recording live
//
// The scenes file is the ONLY thing you edit per app: URL + ordered beats.
import path from 'node:path';
import { statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { narrateBeats } from '../lib/narrate.js';
import { record } from '../lib/record.js';
import { mux } from '../lib/mux.js';
import { probe } from '../lib/probe.js';
import { findBinary, projectRoot, log } from '../lib/util.js';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const scenesArg = argv.find((a) => !a.startsWith('--'));

if (!scenesArg) {
  console.error('usage: demo-maker [--probe] [--headed] <scenes-file.js>');
  process.exit(2);
}

const scenesPath = path.resolve(process.cwd(), scenesArg);
const scenes = (await import(pathToFileURL(scenesPath).href)).default;
if (!scenes?.url || !Array.isArray(scenes?.beats) || scenes.beats.length === 0) {
  console.error(`scenes file must default-export { url, beats: [...] } with at least one beat — got ${JSON.stringify(Object.keys(scenes ?? {}))}`);
  process.exit(2);
}
if (flags.has('--headed')) scenes.headed = true;

const buildDir = path.join(projectRoot, 'build', path.basename(scenesPath).replace(/\.[^.]+$/, ''));

if (flags.has('--probe')) {
  await probe(scenes, buildDir);
  process.exit(0);
}

const ffmpeg = findBinary('ffmpeg');
const ffprobe = findBinary('ffprobe');

// 1. narration first — beat holds depend on each line's spoken duration
log.step('● narrating beats…');
const narrations = await narrateBeats(scenes.beats, scenes.voice, buildDir, ffprobe);

// 2. drive the app + record video
const { videoPath, timeline, misses, measuredDuration } = await record(scenes, narrations, buildDir);

// 3. mux narration onto the video at the recorded timestamps
const outPath = path.resolve(process.cwd(), scenes.output ?? 'output/demo.mp4');
const { duration } = await mux({ videoPath, timeline, measuredDuration, scenes, ffmpeg, ffprobe, outPath });

// 4. summary
log.info('');
log.step('━━━ summary ━━━');
for (const e of timeline) {
  const beatMisses = misses.filter((m) => m.beat === e.index + 1);
  const mark = beatMisses.length ? '⚠' : '✓';
  const label = e.caption ?? scenes.beats[e.index].voiceover ?? '(card)';
  log.info(`  ${mark} beat ${e.index + 1}: ${label.slice(0, 64)}  [${e.tStart.toFixed(1)}s → ${e.tEnd.toFixed(1)}s]`);
}
if (misses.length) {
  log.info('');
  log.warn(`${misses.length} target(s) not found — fix these lines in ${path.relative(process.cwd(), scenesPath)}:`);
  for (const m of misses) log.warn(`  beat ${m.beat}: "${m.target}"`);
} else {
  log.ok('  all targets found ✓');
}
const size = (statSync(outPath).size / 1e6).toFixed(1);
log.ok(`\n● done: ${path.relative(process.cwd(), outPath)} — ${duration.toFixed(1)}s, ${size} MB, ${scenes.video?.width ?? 1920}x${scenes.video?.height ?? 1080}@${scenes.video?.fps ?? 30}fps`);
process.exit(misses.length ? 0 : 0);

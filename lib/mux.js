// Post-production: one ffmpeg pass that
//   1. trims the page-load flash before the first beat,
//   2. normalizes to the target fps and size, encodes H.264/yuv420p,
//   3. lays each beat's narration file at that beat's recorded timestamp
//      (adelay per file → amix), pads audio to video length, muxes AAC.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { run, mediaDuration, log } from './util.js';

const NARRATION_LEAD_S = 0.25; // start speaking a breath after the beat lands

export async function mux({ videoPath, timeline, measuredDuration, scenes, ffmpeg, ffprobe, outPath }) {
  const { width = 1920, height = 1080, fps = 30 } = scenes.video ?? {};
  mkdirSync(path.dirname(outPath), { recursive: true });

  // --- sanity-check recorded video duration vs wall clock ------------------
  // Playwright's webm generally tracks wall time closely; if it drifted
  // (heavy CPU etc.) rescale our timeline so audio stays in sync. Some webms
  // report no duration at all — then we just trust the measured timeline.
  const measured = measuredDuration ?? timeline.at(-1).tEnd;
  let t = (x) => x;
  let videoDur = null;
  try {
    videoDur = await mediaDuration(ffprobe, videoPath);
  } catch {
    log.warn('recorded video reports no duration — skipping the drift check');
  }
  if (videoDur != null) {
    const scale = videoDur / measured;
    if (Math.abs(videoDur - measured) > 0.5 && scale > 0.85 && scale < 1.15) {
      log.warn(`video/wall-clock drift ${(videoDur - measured).toFixed(2)}s — rescaling timestamps ×${scale.toFixed(4)}`);
      t = (x) => x * scale;
    } else {
      log.info(`  sync check: video ${videoDur.toFixed(2)}s vs wall clock ${measured.toFixed(2)}s`);
    }
  }

  // Trim everything before the first beat (page load / white flash).
  const trimStart = Math.max(0, t(timeline[0].tStart) - 0.15);

  const narrated = timeline.filter((e) => e.narr);
  const inputs = ['-i', videoPath];
  for (const e of narrated) inputs.push('-i', e.narr.file);

  const filters = [
    `[0:v]trim=start=${trimStart.toFixed(3)},setpts=PTS-STARTPTS,` +
      `fps=${fps},scale=${width}:${height}:flags=lanczos,format=yuv420p[v]`,
  ];

  let audioMap = null;
  if (narrated.length > 0) {
    const labels = [];
    narrated.forEach((e, k) => {
      const delayMs = Math.max(0, Math.round((t(e.tStart) - trimStart + NARRATION_LEAD_S) * 1000));
      // resample first so every branch matches, then delay into position
      filters.push(`[${k + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs}[a${k}]`);
      labels.push(`[a${k}]`);
    });
    if (labels.length === 1) {
      filters.push(`${labels[0]}apad[aout]`);
    } else {
      filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0[amx]`, `[amx]apad[aout]`);
    }
    audioMap = '[aout]';
  }

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[v]',
    ...(audioMap ? ['-map', audioMap, '-c:a', 'aac', '-b:a', '192k'] : []),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-movflags', '+faststart',
    '-shortest', // audio is padded past video length; cut at video end
    outPath,
  ];

  log.step('● ffmpeg: encoding + muxing narration…');
  await run(ffmpeg, args);
  const finalDur = await mediaDuration(ffprobe, outPath);
  return { outPath, duration: finalDur };
}

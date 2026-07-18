// Narration: one audio file per beat via macOS's built-in `say` (offline, free).
// Durations are measured with ffprobe so the recorder can hold each beat at
// least as long as its voiceover. Files are cached by content hash, so
// re-running after editing one line only regenerates that line.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { run, mediaDuration, log } from './util.js';

/**
 * Generate narration for every beat that has a `voiceover`.
 * Returns a map: beatIndex -> { file, duration }.
 */
export async function narrateBeats(beats, voiceCfg, buildDir, ffprobe) {
  mkdirSync(buildDir, { recursive: true });
  const voice = voiceCfg?.voice || null;   // e.g. "Samantha"; null = system default
  const rate = voiceCfg?.rate || 180;      // words per minute

  const narrations = new Map();
  for (let i = 0; i < beats.length; i++) {
    const text = beats[i].voiceover;
    if (!text) continue;
    const hash = createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 12);
    const file = path.join(buildDir, `narr-${String(i).padStart(2, '0')}-${hash}.aiff`);
    if (!existsSync(file)) {
      // Text goes through a file (-f) so lines starting with "-" can't be
      // mistaken for flags; synth to a temp name + rename so an interrupted
      // `say` never leaves a truncated file behind under the cached name.
      const txt = file.replace(/\.aiff$/, '.txt');
      const tmp = file.replace(/\.aiff$/, '.tmp.aiff');
      writeFileSync(txt, text, 'utf8');
      try {
        await run('say', [...(voice ? ['-v', voice] : []), '-r', String(rate), '-f', txt, '-o', tmp]);
      } catch (err) {
        throw new Error(
          `narration failed for beat ${i + 1} (is this macOS? \`say\` is required):\n${err.message}`
        );
      }
      renameSync(tmp, file);
      rmSync(txt, { force: true });
    }
    const duration = await mediaDuration(ffprobe, file);
    narrations.set(i, { file, duration });
    log.info(`  🎙 beat ${i + 1}: ${duration.toFixed(2)}s — "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
  }
  return narrations;
}

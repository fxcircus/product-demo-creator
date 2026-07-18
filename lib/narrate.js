// Narration: one audio file per beat. Two providers, selected by
// `voice.provider` in the scenes file:
//   'edgeTts' — Microsoft Edge's free neural voices via msedge-tts (natural;
//               needs a network connection, no account/key) — THE DEFAULT.
//   'say'     — macOS built-in `say` (offline, robotic) — also the automatic
//               fallback if edgeTts can't be reached, so a demo always renders.
// Durations are measured with ffprobe so the recorder can hold each beat at
// least as long as its voiceover. Files are cached by a content hash that
// includes the provider + voice + rate, so switching voices only re-synths
// what changed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, renameSync, rmSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { run, mediaDuration, log } from './util.js';

const DEFAULT_EDGE_VOICE = 'en-US-AndrewNeural';

function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** macOS `say` -> AIFF. `rate` is words-per-minute (number). */
async function synthSay({ text, voice, rate, outBase }) {
  const file = `${outBase}.aiff`;
  const txt = `${outBase}.txt`;
  const tmp = `${outBase}.tmp.aiff`;
  // Text via file (-f) so a leading "-" can't be read as a flag; temp+rename
  // so an interrupted `say` never leaves a truncated file under the cache name.
  writeFileSync(txt, text, 'utf8');
  const wpm = Number.isFinite(+rate) ? +rate : 180;
  await run('say', [...(voice ? ['-v', voice] : []), '-r', String(wpm), '-f', txt, '-o', tmp]);
  renameSync(tmp, file);
  rmSync(txt, { force: true });
  return file;
}

/** MS Edge neural voice -> MP3. `rate` is an SSML rate string, e.g. "+6%". */
async function synthEdge({ text, voice, rate, outBase }) {
  const file = `${outBase}.mp3`;
  const tmp = `${outBase}.tmp.mp3`;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice || DEFAULT_EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(xmlEscape(text), { rate: rate || '+0%' });
  await new Promise((resolve, reject) => {
    const w = createWriteStream(tmp);
    audioStream.on('error', reject);
    w.on('error', reject);
    audioStream.pipe(w).on('close', () => (w.bytesWritten > 0 ? resolve() : reject(new Error('no audio received'))));
  });
  renameSync(tmp, file);
  return file;
}

const PROVIDERS = { say: synthSay, edgeTts: synthEdge };

/**
 * Generate narration for every beat that has a `voiceover`.
 * Returns a map: beatIndex -> { file, duration }.
 */
export async function narrateBeats(beats, voiceCfg, buildDir, ffprobe) {
  mkdirSync(buildDir, { recursive: true });
  const provider = voiceCfg?.provider || 'edgeTts'; // natural neural voice by default
  const voice = voiceCfg?.voice ?? (provider === 'edgeTts' ? DEFAULT_EDGE_VOICE : null);
  const rate = voiceCfg?.rate ?? (provider === 'edgeTts' ? '+0%' : 180);
  const synth = PROVIDERS[provider];
  if (!synth) throw new Error(`unknown voice provider "${provider}" (known: ${Object.keys(PROVIDERS).join(', ')})`);
  log.info(`  voice: ${provider}${voice ? ` / ${voice}` : ''} @ rate ${rate}`);

  const narrations = new Map();
  for (let i = 0; i < beats.length; i++) {
    const text = beats[i].voiceover;
    if (!text) continue;
    const hash = createHash('sha1').update(`${provider}|${voice}|${rate}|${text}`).digest('hex').slice(0, 12);
    const outBase = path.join(buildDir, `narr-${String(i).padStart(2, '0')}-${hash}`);

    // find an already-cached file for this beat (either extension)
    let file = ['.mp3', '.aiff'].map((e) => `${outBase}${e}`).find(existsSync) ?? null;
    if (!file) {
      try {
        file = await synth({ text, voice, rate, outBase });
      } catch (err) {
        if (provider !== 'say') {
          log.warn(`${provider} failed for beat ${i + 1} (${err.message.split('\n')[0]}) — falling back to \`say\``);
          file = await synthSay({ text, voice: null, rate: 180, outBase });
        } else {
          throw new Error(`narration failed for beat ${i + 1} (is this macOS? \`say\` is required):\n${err.message}`);
        }
      }
    }
    const duration = await mediaDuration(ffprobe, file);
    narrations.set(i, { file, duration });
    log.info(`  🎙 beat ${i + 1}: ${duration.toFixed(2)}s — "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
  }
  return narrations;
}

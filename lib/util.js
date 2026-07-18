// Small shared helpers: subprocess exec, binary discovery, logging.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileP = promisify(execFile);

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Run a binary, return stdout. Throws with stderr attached on failure. */
export async function run(bin, args, opts = {}) {
  try {
    const { stdout } = await execFileP(bin, args, { maxBuffer: 64 * 1024 * 1024, ...opts });
    return stdout;
  } catch (err) {
    err.message = `${path.basename(bin)} ${args.join(' ')}\n${err.stderr || err.message}`;
    throw err;
  }
}

/**
 * Find ffmpeg/ffprobe: env var override, then the project's vendor/ dir,
 * then whatever is on PATH.
 */
export function findBinary(name) {
  const envVar = process.env[name.toUpperCase() + '_PATH'];
  if (envVar && existsSync(envVar)) return envVar;
  const vendored = path.join(projectRoot, 'vendor', name);
  if (existsSync(vendored)) return vendored;
  return name; // hope it's on PATH; run() will error clearly if not
}

/** Duration of a media file in seconds (via ffprobe). */
export async function mediaDuration(ffprobe, file) {
  const out = await run(ffprobe, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ]);
  const dur = parseFloat(out.trim());
  if (!Number.isFinite(dur)) throw new Error(`could not read duration of ${file}`);
  return dur;
}

export const log = {
  info: (msg) => console.log(msg),
  step: (msg) => console.log(`\x1b[36m${msg}\x1b[0m`),
  warn: (msg) => console.warn(`\x1b[33m⚠ ${msg}\x1b[0m`),
  ok: (msg) => console.log(`\x1b[32m${msg}\x1b[0m`),
};

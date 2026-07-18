// Download static ffmpeg + ffprobe builds into vendor/ (free, no Homebrew).
// Builds by Martin Riedl: https://ffmpeg.martin-riedl.de (macOS arm64/x86_64).
// Skipped automatically if ffmpeg/ffprobe are already on PATH — demo-maker
// falls back to PATH binaries when vendor/ is empty.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'vendor');
const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';

mkdirSync(vendor, { recursive: true });
for (const bin of ['ffmpeg', 'ffprobe']) {
  const dest = path.join(vendor, bin);
  if (existsSync(dest)) {
    console.log(`✓ vendor/${bin} already present`);
    continue;
  }
  const url = `https://ffmpeg.martin-riedl.de/redirect/latest/macos/${arch}/release/${bin}.zip`;
  const zip = path.join(vendor, `${bin}.zip`);
  console.log(`↓ downloading ${bin} (${arch})…`);
  execFileSync('curl', ['-sL', url, '-o', zip], { stdio: 'inherit' });
  execFileSync('unzip', ['-o', '-q', zip, '-d', vendor], { stdio: 'inherit' });
  rmSync(zip);
  chmodSync(dest, 0o755);
  console.log(`✓ vendor/${bin} installed`);
}
console.log('done — verify with: vendor/ffmpeg -version');

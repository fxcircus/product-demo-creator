# product-demo-creator

Turn any live web app into a **narrated, captioned demo video** — no screen
recording, no microphone, no paid services, no API keys. You describe the demo
in one small "scenes" file (a URL plus an ordered list of beats); the tool
clicks through your app, records it, narrates it with a natural neural voice,
and hands you an MP4.

It never modifies the target app — it drives the public URL from the outside,
like a user would.

**See it:** [`examples/vg800-demo.mp4`](examples/vg800-demo.mp4) is a finished
demo this tool produced from a live guitar-tuning web app — the exact output of
`npm run demo`.

```
scenes/myapp.js  ──▶  🗣 neural TTS per line  ──▶  🎬 Playwright records the
(URL + beats)         (duration sets pacing)        clicks at 1920×1080, with
                                                    captions, title cards and a
                                                    demo cursor drawn on top
                                              ──▶  🎞 ffmpeg places each line at
                                                    its beat's timestamp
                                              ──▶  output/myapp-demo.mp4
```

## Quick start (macOS)

```bash
git clone https://github.com/fxcircus/product-demo-creator.git
cd product-demo-creator
npm install
npx playwright install chromium
npm run setup:ffmpeg      # static ffmpeg into vendor/ — skip if ffmpeg is on PATH

npm run demo              # builds the example demo (a live guitar-tuning app)
open output/vg800-demo.mp4
```

## Narration

Playwright's video is silent by design, so speech is synthesized per line and
muxed in afterwards. Two providers, chosen by `voice.provider` in the scenes
file:

- **`edgeTts` (default)** — Microsoft Edge's neural voices via `msedge-tts`.
  Natural-sounding, and **free: no API key, no account, no bill.** It reaches
  the same public endpoint Edge's "Read Aloud" uses, so it needs an internet
  connection. It's an *unofficial* endpoint — fine for personal/hobby demos;
  for **monetized commercial** use, prefer a licensed path (Azure Speech has
  the identical voices, or Kokoro is offline + Apache-2.0).
- **`say`** — macOS's built-in voice: offline and robotic. It's also the
  **automatic fallback** — if `edgeTts` can't reach the network, the demo still
  renders (just robotic), and the run logs a warning.

See the curated voices, or every available one:

```bash
node bin/demo-maker.js --list-voices          # hand-picked shortlist
node bin/demo-maker.js --list-voices --all    # every Edge voice (hundreds)
```

Pick one per demo — in the scenes file, or as a run-time override (no edit):

```bash
node bin/demo-maker.js --voice en-US-GuyNeural scenes/myapp.js
```

```js
voice: { provider: 'edgeTts', voice: 'en-US-AndrewNeural', rate: '+8%' }
// confident/announcer: en-US-GuyNeural, en-US-BrianNeural
// female:              en-US-AvaNeural, en-US-EmmaNeural
// offline fallback:    { provider: 'say', voice: 'Ava', rate: 185 }
```

`edgeTts` rate is an SSML string (`'+8%'`); `say` rate is words-per-minute.

**For the most natural result, write the *spoken* text for the ear.** The
`voiceover` field is separate from the on-screen `caption`/title — so respell
tricky names in speech while keeping them correct on screen. A hyphen makes the
voice pause ("VG-800" → "VG … 800"), so the example says "VG800" in narration
but shows "VG-800". Same for symbols/units ("1920×1080" → "nineteen-twenty by
ten-eighty").

## Demo your own product

**1. Probe first — never guess selectors.**

```bash
node bin/demo-maker.js --probe scenes/myapp.js
```

Prints every clickable label the browser can see (with ARIA info and
above/below-the-fold markers) and saves viewport + full-page screenshots.

**2. Copy `scenes/vg800.js`, change `url` + `output`, write your beats:**

```js
{
  voiceover: 'What the voice says — the beat stays on screen at least this long.',
  caption:   'Burned-in subtitle, readable with sound off (null = none)',
  actions: [
    { click: 'Save' },                            // visible text / accessible name
    { click: { role: 'button', name: 'Theme' } }, // ARIA role + name (icon buttons)
    { click: { selector: '#thing' } },            // CSS escape hatch — last resort
    { hold: 'Bender', ms: 1800 },                 // press-and-hold, then release
    { wait: 800 },                                // pause between actions (ms)
    { press: 'Escape' },                          // keyboard key
    { showCard: { title: 'My App', subtitle: '…' } }, // intro/outro title card
    { hideCard: true },
  ],
  minHold: 4.0, // optional: seconds on screen even if the line is short
}
```

**3. Run it:**

```bash
node bin/demo-maker.js scenes/myapp.js          # or --headed to watch live
```

A target that can't be found is **skipped, never fatal** — the recording
continues and the final summary names the exact label to fix:

```
⚠ 1 target(s) not found — fix these lines in scenes/myapp.js:
⚠   beat 7: "LP"
```

## How clicks find their target

Exact ARIA `button/tab/menuitem/link` name → exact visible text → *starts-with*
fallback (never substring: "LP" must not match "he**lp**"). Hidden/`display:none`
matches are ignored, the smallest visible match wins, and iframes are searched
after the main page. A fake cursor glides to each target so viewers can follow.

## Knobs

| Thing | Where |
|---|---|
| Voice / provider / rate | `voice: { provider: 'edgeTts', voice: 'en-US-AndrewNeural', rate: '+8%' }` — see [Narration](#narration) |
| Resolution / fps | `video: { width: 1920, height: 1080, fps: 30 }` |
| Pause after each line | `defaults: { tailPad: 0.9 }` |
| Page-settle time before beat 1 | `settle: 2500` (ms) |
| Pre-granted permissions | `permissions: ['midi']` — never `'midi-sysex'`, it crashes headless Chromium |
| Watch the run live | `--headed` |
| Narration cache | `build/<scene>/` — edit one line, only that line re-synthesizes |

## Tips from real use

- **App state can move your targets.** Panels swap, labels appear/disappear
  after clicks (in the example app, entering chord mode removes the bender
  rail). If a label misses mid-demo, ask what an earlier beat changed —
  reordering beats is usually the fix.
- Every run uses a fresh browser profile, so localStorage-persisted state
  (themes, settings) never leaks between takes.
- Sync is measured, not assumed: beats are timestamped during recording, and
  narration placement is rescaled if the encoded video drifted from wall clock.
- Sanity-check a take fast: `vendor/ffmpeg -ss 12 -i output/demo.mp4 -frames:v 1 f.png`
  and look at the frame.

MIT — see [LICENSE](LICENSE).

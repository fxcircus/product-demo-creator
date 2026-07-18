---
name: make-demo-video
description: Create or fix a narrated demo video of a live web app using this repo's demo-maker pipeline (scenes file → probe → record → verify frames). Use whenever the user wants a product demo video, a new scenes file, or a beat/selector fixed.
---

# Making a demo video with demo-maker

The pipeline is `node bin/demo-maker.js scenes/<app>.js`: it synthesizes
narration (natural neural voice by default), drives the app's URL in headless
Playwright Chromium (recordVideo), and muxes audio + encodes with the vendored
ffmpeg. The only file that changes per app is the scenes file. The goal is the
**most natural-sounding result possible** — that means the right voice AND
scripts written so the voice reads them cleanly. Follow this loop:

## 0. Ask which voice — before writing narration

Voice is a taste call, so ask the user up front with **AskUserQuestion** rather
than assuming. List the curated options first:

```bash
node bin/demo-maker.js --list-voices        # curated shortlist (+ --all for every voice)
```

Offer 3–4 from the shortlist as options (Andrew = warm default, Guy/Brian =
confident announcer, Ava/Emma = female), and mention they can name any Edge
voice. If they're unsure, **generate a few one-line samples so they can hear
them** before committing (one short MsEdgeTTS call per voice → an mp3; send the
files). Set the pick in the scenes file's `voice:` or pass `--voice <id>` at
run time — no file edit needed:

```bash
node bin/demo-maker.js --voice en-US-GuyNeural scenes/<app>.js
```

## 1. Probe before writing a single beat

```bash
node bin/demo-maker.js --probe scenes/<app>.js
```

- Gives every clickable label (ARIA-aware), fold markers, iframe notices, and
  viewport + full-page screenshots. **Read the screenshots with the Read tool**
  — layout tells you what a 1920×1080 camera will actually show.
- For labels hidden behind toggles/menus, write a tiny one-off Playwright
  script that clicks the toggle and dumps the revealed labels — never guess.

## 2. Write beats against how the app really behaves

- Prefer `{ click: 'VisibleLabel' }`; use `{ click: { role, name } }` for
  icon-only buttons; CSS selectors only as a last resort.
- **App state moves targets.** A click can swap panels, rename labels, or
  auto-change unrelated controls. If a label exists at load but misses
  mid-demo, an earlier beat changed the state — reorder beats or add an
  explicit click to restore state.
- Beats hold as long as their narration automatically; add `minHold` only for
  animations that outlast the line, and `{ wait }` between clicks in a beat.

## 2b. Write narration the neural voice reads cleanly

The `voiceover` field is **spoken text**, separate from `caption` and title
cards (**shown text**). Exploit that: spell things for the ear in `voiceover`
while keeping the correct name on screen. Rules for natural output:

- **Hyphenated names pause.** "VG-800" is read "VG … 800" with a gap. Respell
  the *spoken* line "VG800" (glued) or "VG eight hundred"; keep "VG-800" in the
  caption/card. (Real case — this is exactly why the example demo does it.)
- **Acronyms / model numbers:** decide per term whether it should be said as
  letters ("MIDI" → "middy" reads fine; "MA28" may need "M-A-28") or words.
  When unsure how the *user* wants a term pronounced, don't guess.
- **Symbols & units:** "1920×1080" → "nineteen-twenty by ten-eighty";
  "$5/mo" → "five dollars a month"; "&" → "and"; "/" → "or". The engine reads
  literal symbols unpredictably.
- **Punctuation is pacing.** Commas and em-dashes add natural micro-pauses;
  use them instead of cramming clauses together. A period between two ideas
  reads better than a comma.

### Proactively flag mispronunciation risks with AskUserQuestion

Before rendering, scan every `voiceover` line for terms likely to mis-say:
brand/model names, hyphenated or alphanumeric tokens, initialisms, unusual
proper nouns, symbols, numbers with units. For each risky term, **ask the user
how they want it pronounced** (AskUserQuestion) rather than guessing — e.g.
"'VG-800' — say it as one word 'VG800', spell it 'V-G-800', or 'vee-gee eight
hundred'?" Batch these into one question with a few options each. When a term
is genuinely ambiguous and you can't preview it confidently, **generate quick
TTS samples of the candidates and let the user pick by ear.** Getting these
right up front is the difference between "robotic" and "natural."

## 3. Run and iterate on the summary

- Run the pipeline (in this harness, Playwright launches need Bash with
  `dangerouslyDisableSandbox: true` — the seatbelt sandbox crashes Chromium).
- Misses never crash the run; the summary names the exact label to fix.
- Never grant the `midi-sysex` permission — it hard-crashes headless Chromium.

## 4. Verify with frames, not vibes

```bash
vendor/ffmpeg -ss <t> -i output/<app>-demo.mp4 -frames:v 1 -y frame.png
```

Extract frames at each beat's timestamp (printed in the summary) and **look at
them** with the Read tool: did the click land on the right control, is the
caption right, any stray tooltips/modals photobombing? Check audio placement
with `silencedetect` — speech onsets should sit ~0.25s after each beat start.

## Known pitfalls (all hit in practice)

- Substring label matching is poison ("LP" matched "About & heLP" and opened a
  modal that blocked everything after). The resolver now uses exact →
  starts-with; keep it that way.
- Hidden DOM (help modals, jump menus) is full of duplicate label text — only
  visible matches count, smallest visible match wins.
- Hover tooltips linger where the real mouse rests; the resolver parks the
  mouse at (2,2) after each click. Don't remove that.
- Playwright video is silent by design → narration is synthesized separately
  and muxed at recorded beat timestamps. Default provider is `edgeTts` (free MS
  Edge neural voices, needs network); `say` is the offline fallback. Expect ±1s
  wall-clock drift; the muxer rescales automatically.
- ffmpeg/ffprobe are vendored in `vendor/` (this machine has no Homebrew);
  refetch with `npm run setup:ffmpeg`.

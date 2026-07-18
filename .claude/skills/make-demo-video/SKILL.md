---
name: make-demo-video
description: Create or fix a narrated demo video of a live web app using this repo's demo-maker pipeline (scenes file → probe → record → verify frames). Use whenever the user wants a product demo video, a new scenes file, or a beat/selector fixed.
---

# Making a demo video with demo-maker

The pipeline is `node bin/demo-maker.js scenes/<app>.js`: it synthesizes
narration with `say`, drives the app's URL in headless Playwright Chromium
(recordVideo), and muxes audio + encodes with the vendored ffmpeg. The only
file that changes per app is the scenes file. Follow this exact loop:

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
- Playwright video is silent by design → narration must be offline TTS muxed
  at recorded beat timestamps. Expect ±1s wall-clock drift; the muxer
  rescales automatically.
- ffmpeg/ffprobe are vendored in `vendor/` (this machine has no Homebrew);
  refetch with `npm run setup:ffmpeg`.

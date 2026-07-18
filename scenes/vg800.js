// Demo script for the VG-800 web app.
// ─────────────────────────────────────────────────────────────────────────────
// To make a demo for a NEW app: copy this file, change `url` + `output`,
// rewrite `beats`. Nothing else in the project needs to change.
// Run `node bin/demo-maker.js --probe scenes/yourapp.js` first — it prints
// every clickable label the recorder can see, so you never guess.
//
// A beat = one narrated shot:
//   voiceover  what the robot voice says (macOS `say`); its measured duration
//              sets the beat's minimum on-screen time automatically
//   caption    burned-in subtitle shown during the beat (null = no caption,
//              e.g. while a title card is up)
//   actions    ordered list, run at the start of the beat:
//     { click: "Label" }                 click by visible text / accessible name
//     { click: { role: 'button', name: 'X' } }   click by ARIA role+name
//     { click: { selector: '#css' } }    CSS escape hatch (avoid when possible)
//     { hold: "Label", ms: 1800 }        press-and-hold, then release
//     { wait: 800 }                      pause (ms) between actions in a beat
//     { showCard: { title, subtitle } }  full-screen title card overlay
//     { hideCard: true }                 fade the card out
//   minHold    optional: minimum seconds for the beat even if narration is short
//
// A click target that isn't found is logged, skipped, and listed in the final
// summary — the recording never crashes.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  url: 'https://fxcircus.github.io/boss-vg800-midi-control-from-browser/vg800-tuner.html',
  output: 'output/vg800-demo.mp4',

  video: { width: 1920, height: 1080, fps: 30 }, // 1920 wide = the app's widest layout
  voice: { voice: null, rate: 185 },  // null = system default voice; `say -v ?` lists others
  // Pre-grant so no permission prompt appears on camera. NOTE: do NOT add
  // 'midi-sysex' here — granting it crashes headless Chromium's renderer.
  permissions: ['midi'],
  settle: 2500,                        // ms to let the page settle before beat 1

  defaults: { minHold: 3.0, tailPad: 0.9 }, // tailPad: silence after each VO line

  beats: [
    // 1 ── intro title card ──────────────────────────────────────────────────
    {
      voiceover: 'VG-800 MIDI Control. Retune your Boss VG-800 from the browser.',
      caption: null, // the card itself is the text
      actions: [
        { showCard: { title: 'VG-800 MIDI Control', subtitle: 'Retune your Boss VG-800 from the browser' } },
      ],
      minHold: 3.6,
    },

    // 2 ── reveal the app, let the default view settle ───────────────────────
    {
      voiceover: 'Every alternate tuning, one click away.',
      caption: 'Every alternate tuning, one click away',
      actions: [{ hideCard: true }],
      minHold: 3.2,
    },

    // 3 ── DADGAD ────────────────────────────────────────────────────────────
    {
      voiceover: 'Tap a tuning, and all six strings retune at once. Here: DADGAD.',
      caption: 'One tap — all six strings retune: DADGAD',
      actions: [{ click: 'DADGAD' }],
      minHold: 5.0, // linger so the pitch-neck readout animation plays out
    },

    // 4 ── Nashville ─────────────────────────────────────────────────────────
    {
      voiceover: 'Dozens more, from open majors to Nashville high-strung.',
      caption: 'Dozens of tunings — open majors to Nashville high-strung',
      actions: [{ click: 'Nashville' }],
      minHold: 4.5,
    },

    // 5 ── pedal-steel bend: press-and-hold the "Sixth" bender ───────────────
    // The Bends rail is sticky top-left and visible from page load — there is
    // no "Bends" opener to click. The card reads SIXTH (CSS uppercase).
    // ORDER MATTERS: this beat must come BEFORE the Chords beat (chord mode
    // swaps the rail to per-string scale bends) and while Nashville/Standard
    // is active (DADGAD installs its own custom pedal, removing "Sixth").
    {
      voiceover: 'Hold a bender, and the strings glide into pitch. Pedal-steel style.',
      caption: 'Benders glide strings into pitch — pedal-steel style',
      actions: [
        { hold: 'Sixth', ms: 1800 }, // hold so it glides in, release to spring back
      ],
      minHold: 6.0,
    },

    // 6 ── chords section: two diatonic cells ────────────────────────────────
    // "Chords" is a nav tab that smooth-scrolls to the chord grid (~1.2s).
    // Diatonic cells carry Roman-numeral badges: "IV" sits on the F cell and
    // the dominant is labelled "V7" (on G7) — there is no bare "V" on screen.
    {
      voiceover: 'Or play fully voiced chords, colour-coded by harmonic function.',
      caption: 'Fully voiced chords, colour-coded by function',
      actions: [
        { click: 'Chords' },
        { wait: 1500 }, // let the smooth scroll land
        { click: 'IV' },
        { wait: 1100 },
        { click: 'V7' },
      ],
      minHold: 6.5,
    },

    // 7 ── guitar models: LP (electric), then swap to Acoustic for MA28 ──────
    // The guitar rail is sticky top-right. MA28 lives under the "Acoustic"
    // toggle (Electric 12 + Acoustic 9 = the 21 models).
    {
      voiceover: 'Switch between twenty-one guitar and acoustic models on the fly.',
      caption: '21 guitar & acoustic models',
      actions: [
        { click: 'Electric' }, // the app auto-flips to Acoustic after chord beats — come back first
        { wait: 1000 },
        { click: 'LP' },
        { wait: 1300 },
        { click: 'Acoustic' },
        { wait: 900 },
        { click: 'MA28' },
      ],
      minHold: 6.0,
    },

    // 8 ── themes: pedal-icon button (aria-label "Theme"), then GT1000 ───────
    // The theme button has no visible text — it's targeted by its ARIA label.
    // If the app ever renames it, this is the beat to re-check first.
    {
      voiceover: 'Five themes, each styled after a classic Boss pedal.',
      caption: 'Five themes, styled after classic Boss pedals',
      actions: [
        { click: { role: 'button', name: 'Theme' } },
        { wait: 800 },
        { click: 'GT1000' },
      ],
      minHold: 4.5,
    },

    // 9 ── outro card ────────────────────────────────────────────────────────
    {
      voiceover: 'Free, open source, and running in your browser now.',
      caption: null,
      actions: [
        { showCard: { title: 'Free & open source', subtitle: 'Running in your browser now' } },
      ],
      minHold: 4.0,
    },
  ],
};

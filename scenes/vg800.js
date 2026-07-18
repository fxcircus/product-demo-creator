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
//     { press: 'Escape' }                keyboard key
//     { showCard: { title, subtitle } }  full-screen title card overlay
//     { hideCard: true }                 fade the card out
//   minHold    optional: minimum seconds for the beat even if narration is short
//
// A click target that isn't found is logged, skipped, and listed in the final
// summary — the recording never crashes.
//
// NOTE on this app at 1920px: the ☰ jump menu only exists below 1280px wide.
// At recording width the same destinations are the nav tabs (Basic, Open
// Majors, Ethnic, Chords, Lap Steel…), which smooth-scroll to each section —
// so "open ☰ → X" is expressed here as a direct click on the X tab.
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
    // 1 ── intro title card (short!) ─────────────────────────────────────────
    // The card shows for ~3s, then fades out so the product is on screen
    // fast — the rest of the intro line narrates over the revealed app.
    {
      voiceover: 'VG-800 MIDI Control. Retune your guitar digitally using the Boss VG-800 and its divided pickup system, straight from the browser over MIDI.',
      caption: null, // the card itself is the text
      actions: [
        { showCard: { title: 'VG-800 MIDI Control', subtitle: 'Retune your guitar over MIDI — right from the browser' } },
        { wait: 3000 },
        { hideCard: true },
      ],
      minHold: 3.6,
    },

    // 2 ── let the default view settle (Basic tunings) ───────────────────────
    {
      voiceover: 'Every alternate tuning, one click away.',
      caption: 'Every alternate tuning, one click away',
      actions: [],
      minHold: 3.2,
    },

    // 3 ── Open Majors → Open G Dobro ────────────────────────────────────────
    // Nav tab scrolls to the Open Majors section, then tap the card. Linger
    // so the readout animates each string to pitch.
    {
      voiceover: 'Tap a tuning, and all six strings retune at once — like Open G Dobro.',
      caption: 'One tap — all six strings retune: Open G Dobro',
      actions: [
        { click: 'Open Majors' },
        { wait: 1200 },
        { click: 'Open G Dobro' },
      ],
      minHold: 6.5,
    },

    // 4 ── beyond guitar: Lap Steel (E7), then Ethnic (Mandolin) ─────────────
    // "E7" also exists as a chord cell in the Chords grid — the resolver
    // prefers the in-viewport match, so after scrolling to Lap Steel the E7
    // card (under Dominant / 7th) wins. Linger on each instrument.
    {
      voiceover: "Go beyond guitar — there's lap steel, pedal steel, even ethnic instruments like mandolin and oud.",
      caption: 'Lap steel, pedal steel & ethnic instruments',
      actions: [
        { click: 'Lap Steel' },
        { wait: 1400 },
        { click: 'E7' },
        { wait: 2400 },
        { click: 'Ethnic' },
        { wait: 1400 },
        { click: 'Mandolin' },
      ],
      minHold: 12.5,
    },

    // 5 ── pedal-steel bend FROM E7: press-and-hold the "IV Chord" combo ─────
    // The Bends rail is sticky top-left (there is no "Bends" tab at 1920px).
    // STATE MATTERS twice here:
    //  • under Mandolin (end of beat 4) the combo pads read "no root" and
    //    holding them bends nothing — so re-apply E7 first, where IV Chord
    //    bends 2 B→C#, 3 G#→A, 6 B→C#;
    //  • the "Lap Steel" nav click must come before the E7 click so the
    //    lap-steel card is in the viewport — otherwise "E7" would resolve to
    //    the off-screen E7 cell in the Chords grid.
    {
      voiceover: 'Hold a bender and the strings glide into pitch — pedal-steel style.',
      caption: 'Benders glide strings into pitch — pedal-steel style',
      actions: [
        { click: 'Lap Steel' },
        { wait: 1800 }, // long smooth-scroll from Ethnic — let it land
        // By now "E7" exists in THREE places: the lap-steel card, the E7 cell
        // in the Chords grid, and a clipboard history chip logged in beat 4.
        // Labels can't disambiguate that, so scope to the lap-steel
        // "Dominant / 7th" family group — the one legitimate use of the CSS
        // escape hatch.
        { click: { selector: '#fam-dominant-7th .card:has(.card-name:text-is("E7"))' } },
        { wait: 1000 },
        { hold: 'IV Chord', ms: 1800 }, // glides in, springs back on release
      ],
      minHold: 9.5,
    },

    // 6 ── chords section: the IV and V7 cells ───────────────────────────────
    // "Chords" nav smooth-scrolls to the grid (~1.2s). The F cell carries the
    // "IV" badge and the G7 cell (7 row) carries "V7" — the badges are the
    // unambiguous click targets ("F"/"G7" as text collide with note letters
    // and key caps all over the page), and they select exactly those cells.
    {
      voiceover: 'Play fully voiced chords, colour-coded by harmonic function.',
      caption: 'Fully voiced chords, colour-coded by function',
      actions: [
        { click: 'Chords' },
        { wait: 1500 }, // let the smooth scroll land
        { click: 'IV' },  // = the F cell
        { wait: 1100 },
        { click: 'V7' },  // = the G7 cell
      ],
      minHold: 6.5,
    },

    // 7 ── guitar models: LP (electric), then swap to Acoustic for MA28 ──────
    // The guitar rail is sticky top-right. The app auto-flips to an acoustic
    // model after chord beats, so come back to Electric first. MA28 lives
    // under the "Acoustic" toggle (Electric 12 + Acoustic 9 = the 21 models).
    {
      voiceover: 'Switch between twenty-one guitar and acoustic models on the fly.',
      caption: '21 guitar & acoustic models',
      actions: [
        { click: 'Electric' },
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
      voiceover: 'Free and open source — download now, link in the caption.',
      caption: null,
      actions: [
        { showCard: { title: 'Free & open source', subtitle: 'Download now — link in the caption' } },
      ],
      minHold: 4.0,
    },
  ],
};

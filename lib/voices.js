// Curated MS Edge neural voices that read well for product-demo narration.
// `id` is the Edge "ShortName" passed to msedge-tts. This is a hand-picked
// shortlist — list every available voice (hundreds) with:
//   node bin/demo-maker.js --list-voices --all
import { MsEdgeTTS } from 'msedge-tts';

export const DEFAULT_EDGE_VOICE = 'en-US-AndrewNeural';

export const RECOMMENDED_VOICES = [
  { id: 'en-US-AndrewNeural',      label: 'Andrew (US)',      blurb: 'warm, natural, conversational — the default' },
  { id: 'en-US-GuyNeural',         label: 'Guy (US)',         blurb: 'confident, upbeat announcer' },
  { id: 'en-US-BrianNeural',       label: 'Brian (US)',       blurb: 'deep, relaxed, confident' },
  { id: 'en-US-ChristopherNeural', label: 'Christopher (US)', blurb: 'authoritative newscaster' },
  { id: 'en-US-RogerNeural',       label: 'Roger (US)',       blurb: 'clear, measured' },
  { id: 'en-US-AvaNeural',         label: 'Ava (US)',         blurb: 'natural, friendly female' },
  { id: 'en-US-EmmaNeural',        label: 'Emma (US)',        blurb: 'light, friendly female' },
  { id: 'en-US-JennyNeural',       label: 'Jenny (US)',       blurb: 'warm, versatile female' },
  { id: 'en-GB-RyanNeural',        label: 'Ryan (UK)',        blurb: 'British male, crisp' },
  { id: 'en-GB-SoniaNeural',       label: 'Sonia (UK)',       blurb: 'British female, polished' },
  { id: 'en-AU-WilliamNeural',     label: 'William (AU)',     blurb: 'Australian male' },
];

/** Fetch the full list of Edge voices (ShortName, Gender, Locale, …). */
export async function fetchAllVoices() {
  return new MsEdgeTTS().getVoices();
}

/** Is `id` a plausible Edge voice ShortName (locale-Name-Neural)? */
export function looksLikeEdgeVoice(id) {
  return typeof id === 'string' && /^[a-z]{2}-[A-Z]{2}-.+/.test(id);
}

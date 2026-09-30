export interface LayerDef {
  n: number;
  name: string;
  audience: string;
  blurb: string;
  words: number;
}

export const LAYERS: LayerDef[] = [
  { n: 1, name: 'The Story', audience: 'Like you’re 5', blurb: 'The core idea as a simple story. No jargon.', words: 220 },
  { n: 2, name: 'The Picture', audience: 'Like you’re 10', blurb: 'The problem, the key idea and the first real terms.', words: 380 },
  { n: 3, name: 'The Mechanism', audience: 'Curious engineer', blurb: 'How it actually works, step by step.', words: 600 },
  { n: 4, name: 'The Blueprint', audience: 'Practitioner', blurb: 'Precise design, trade-offs and prior art.', words: 850 },
  { n: 5, name: 'The Source Map', audience: 'Expert', blurb: 'A guide to the original, section by section.', words: 950 },
];

export const LAYER_COUNT = LAYERS.length;
export const ORIGINAL = LAYER_COUNT + 1;

export const layerDef = (n: number) => LAYERS[n - 1];

/** A quiz passes when at least this share of answers are correct. */
export const PASS_RATIO = 2 / 3;

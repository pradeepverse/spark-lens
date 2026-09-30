import type { Segment } from '../shared/types';

const TARGET_WORDS = 140;

export const countWords = (s: string) => (s.match(/\S+/g) ?? []).length;

export const clean = (s: string) => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

/** Builds sequential segment ids once all segments are known. */
export function numbered(parts: Omit<Segment, 'id'>[]): Segment[] {
  return parts.filter((p) => p.text.trim()).map((p, i) => ({ ...p, id: `s${i + 1}` }));
}

/** Merges short paragraphs under the same heading into segments of a comfortable reading size. */
export function mergeParagraphs(paras: { heading?: string; text: string }[]): Omit<Segment, 'id'>[] {
  const out: Omit<Segment, 'id'>[] = [];
  let cur: Omit<Segment, 'id'> | undefined;
  for (const p of paras) {
    if (cur && cur.heading === p.heading && countWords(cur.text) + countWords(p.text) <= TARGET_WORDS * 1.5) {
      cur.text += `\n\n${p.text}`;
    } else {
      cur = { heading: p.heading, text: p.text, role: 'body' };
      out.push(cur);
    }
  }
  return out;
}

const HEADING_RE =
  /^((\d+(\.\d+)*\.?|[IVX]+\.|[A-H]\.)\s+[A-Z][^.!?]{2,80}|abstract|introduction|background|related work|method(s|ology)?|approach|experiments?|evaluation|results|discussion|conclusions?|limitations|references|bibliography|acknowledge?ments?|appendix.*)$/i;

/**
 * Turns loose text (from PDFs or pasted content) into readable segments: headings are
 * detected heuristically and paragraphs are merged until they reach a comfortable size.
 */
export function segmentPlainText(raw: string): Omit<Segment, 'id'>[] {
  const text = raw
    .replace(/\r/g, '')
    .replace(/(\w)-\n(\w)/g, '$1$2') // de-hyphenate line breaks
    .replace(/ /g, ' ');
  const lines = text.split('\n').map((l) => l.trim());
  const out: Omit<Segment, 'id'>[] = [];
  let heading: string | undefined;
  let buf: string[] = [];
  let words = 0;

  const flush = () => {
    const body = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (body) out.push({ heading, text: body, role: 'body' });
    buf = [];
    words = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      if (words >= TARGET_WORDS * 0.6) flush();
      continue;
    }
    if (line.length < 90 && HEADING_RE.test(line)) {
      flush();
      heading = line.replace(/\s+/g, ' ');
      if (/^(references|bibliography)$/i.test(heading) && out.length > 10) break;
      continue;
    }
    buf.push(line);
    words += countWords(line);
    if (words >= TARGET_WORDS && /[.!?:]["”)]?$/.test(line)) flush();
    else if (words >= TARGET_WORDS * 2.2) flush();
  }
  flush();
  return out;
}

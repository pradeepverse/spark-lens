import { parseHTML } from 'linkedom';
import type { Segment } from '../shared/types';
import type { LoadedSource } from './index';
import { get } from './http';
import { clean, mergeParagraphs, numbered } from './segment';

/** Normalizes "US 10,133,916 B2" or "10133916" to "US10133916B2" / "US10133916". */
export function normalizePatentNumber(input: string): string | undefined {
  let s = input.trim().toUpperCase().replace(/[\s,.\-/]/g, '');
  if (/^\d{6,8}$/.test(s)) s = `US${s}`;
  if (/^(US|EP|WO|CN|JP|KR|DE|GB|FR|CA|AU|IN|TW|BR|RU|ES|IT|NL|SE|CH)\d{5,}[A-Z]?\d?$/.test(s)) return s;
  return undefined;
}

export const googlePatentsUrl = (number: string) => `https://patents.google.com/patent/${number}/en`;

export function patentNumberFromUrl(url: string): string | undefined {
  const m = url.match(/patents\.google\.com\/patent\/([A-Z0-9]+)/i);
  return m?.[1]?.toUpperCase();
}

export async function loadPatent(number: string): Promise<LoadedSource> {
  const errors: string[] = [];
  try {
    return await fromGooglePatents(number);
  } catch (err) {
    errors.push(`Google Patents: ${(err as Error).message}`);
  }
  if (number.startsWith('US')) {
    try {
      return await fromFreePatentsOnline(number);
    } catch (err) {
      errors.push(`FreePatentsOnline: ${(err as Error).message}`);
    }
  }
  throw new Error(
    `Could not fetch patent ${number}. ${errors.join(' · ')}. Patent sites sometimes rate-limit automated requests. Try again in a few minutes, or download the PDF from ${googlePatentsUrl(number)} and open it with "Open PDF".`,
  );
}

async function fromGooglePatents(number: string): Promise<LoadedSource> {
  const res = await get(googlePatentsUrl(number), { retries: 2 });
  const { document } = parseHTML(await res.text());
  const abstract = clean(document.querySelector('section[itemprop="abstract"] .abstract, section[itemprop="abstract"]')?.textContent ?? '').replace(/^Abstract\s*/i, '');
  const descRoot = document.querySelector('section[itemprop="description"]');
  const claimsRoot = document.querySelector('section[itemprop="claims"]');
  if (!descRoot && !claimsRoot) throw new Error('page had no patent text (possibly rate-limited)');

  const title =
    clean(document.querySelector('meta[name="DC.title"]')?.getAttribute('content') ?? '') ||
    clean(document.querySelector('[itemprop="title"]')?.textContent ?? '') ||
    number;
  const assignee = clean(document.querySelector('dd[itemprop="assigneeOriginal"]')?.textContent ?? '');
  const date = clean(document.querySelector('time[itemprop="priorityDate"]')?.textContent ?? '');

  const paras: { heading?: string; text: string }[] = [];
  if (descRoot) {
    let heading: string | undefined;
    const sel = 'heading, h2, h3, .description-paragraph, p, li';
    for (const el of Array.from(descRoot.querySelectorAll(sel)) as Element[]) {
      if (el.parentElement?.closest(sel)) continue;
      const text = clean(el.textContent ?? '');
      if (!text) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'heading' || tag === 'h2' || tag === 'h3') heading = text;
      else paras.push({ heading, text });
    }
  }

  const claims: string[] = [];
  if (claimsRoot) {
    const sel = '.claim, claim';
    for (const el of Array.from(claimsRoot.querySelectorAll(sel)) as Element[]) {
      if (el.parentElement?.closest(sel)) continue;
      const text = clean(el.textContent ?? '');
      if (text) claims.push(text);
    }
  }

  return build(number, title, abstract, paras, claims, [assignee, date].filter(Boolean).join(' · '));
}

async function fromFreePatentsOnline(number: string): Promise<LoadedSource> {
  const digits = number.replace(/^US/, '').replace(/[A-Z]\d?$/, '');
  const res = await get(`https://www.freepatentsonline.com/${digits}.html`, { retries: 1 });
  const { document } = parseHTML(await res.text());
  let title = number;
  let abstract = '';
  let assignee = '';
  const paras: { heading?: string; text: string }[] = [];
  const claims: string[] = [];

  for (const block of Array.from(document.querySelectorAll('div.disp_doc2')) as Element[]) {
    const label = clean(block.querySelector('.disp_elm_title')?.textContent ?? '').replace(/:$/, '').toLowerCase();
    const body = block.querySelector('.disp_elm_text');
    if (!body) continue;
    const text = clean(body.textContent ?? '');
    if (label === 'title') title = text;
    else if (label === 'abstract') abstract = text;
    else if (label === 'assignee') assignee = text;
    else if (label === 'claims') {
      claims.push(...text.split(/\n(?=\d+\.\s)/).map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean));
    } else if (label === 'description') {
      let heading: string | undefined;
      for (const line of text.split('\n')) {
        const l = line.trim();
        if (!l) continue;
        if (l.length < 70 && l === l.toUpperCase() && /[A-Z]/.test(l)) heading = l;
        else paras.push({ heading, text: l });
      }
    }
  }
  if (!paras.length && !claims.length) throw new Error('page had no patent text');
  return build(number, title, abstract, paras, claims, assignee);
}

function build(number: string, title: string, abstract: string, paras: { heading?: string; text: string }[], claims: string[], byline: string): LoadedSource {
  const parts: Omit<Segment, 'id'>[] = [];
  if (abstract) parts.push({ heading: 'Abstract', text: abstract, role: 'abstract' });
  parts.push(...mergeParagraphs(paras));
  claims.forEach((c) => parts.push({ heading: 'Claims', text: c, role: 'claim' }));
  return {
    title: `${title} (${number})`,
    kind: 'patent',
    docType: 'patent',
    source: googlePatentsUrl(number),
    segments: numbered(parts),
    byline,
  };
}

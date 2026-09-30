import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { LoadedSource } from './index';
import { get, isPdfResponse } from './http';
import { loadPdfBytes } from './pdf';
import { clean, countWords, mergeParagraphs, numbered } from './segment';

const ARXIV_RE = /arxiv\.org\/(?:abs|pdf|html)\/([\w.\-/]+?)(?:v\d+)?(?:\.pdf)?$/i;

export async function loadUrl(url: string): Promise<LoadedSource> {
  const arxiv = url.match(ARXIV_RE);
  if (arxiv) return loadArxiv(arxiv[1]);

  const res = await get(url, { retries: 1 });
  if (isPdfResponse(res, url)) {
    const src = await loadPdfBytes(new Uint8Array(await res.arrayBuffer()), url, titleFromUrl(url));
    return { ...src, kind: 'url' };
  }

  const html = await res.text();
  const { document } = parseHTML(html);
  const pdfLink = document.querySelector('meta[name="citation_pdf_url"]')?.getAttribute('content');
  const citationTitle = document.querySelector('meta[name="citation_title"]')?.getAttribute('content');
  const article = new Readability(document as unknown as Document).parse();

  const segments = article?.content ? segmentHtml(article.content) : [];
  const words = segments.reduce((n, s) => n + countWords(s.text), 0);

  // Academic landing pages carry little text but link to the full PDF.
  if (pdfLink && words < 1500) {
    try {
      const pdfRes = await get(new URL(pdfLink, url).toString(), { retries: 1 });
      const src = await loadPdfBytes(new Uint8Array(await pdfRes.arrayBuffer()), url, citationTitle ?? titleFromUrl(url));
      return { ...src, kind: 'url', title: citationTitle ?? src.title };
    } catch {
      // Fall back to the HTML we have.
    }
  }
  if (words < 80) throw new Error('Could not find readable article text on that page. Try pasting the text or opening the PDF.');

  return {
    title: clean(citationTitle ?? article?.title ?? titleFromUrl(url)),
    kind: 'url',
    docType: pdfLink || citationTitle ? 'paper' : 'article',
    source: url,
    segments: numbered(segments),
    byline: clean([article?.byline, article?.siteName].filter(Boolean).join(' · ')),
  };
}

async function loadArxiv(id: string): Promise<LoadedSource> {
  const absUrl = `https://arxiv.org/abs/${id}`;
  let title: string | undefined;
  let byline: string | undefined;
  try {
    const { document } = parseHTML(await (await get(absUrl)).text());
    title = document.querySelector('meta[name="citation_title"]')?.getAttribute('content') ?? undefined;
    const authors = Array.from(document.querySelectorAll('meta[name="citation_author"]')).map((m) => (m as Element).getAttribute('content'));
    byline = authors.length ? `${authors.slice(0, 3).join(', ')}${authors.length > 3 ? ' et al.' : ''} · arXiv ${id}` : `arXiv ${id}`;
  } catch {
    // The PDF alone is enough.
  }
  const pdf = await get(`https://arxiv.org/pdf/${id}`, { retries: 2 });
  const src = await loadPdfBytes(new Uint8Array(await pdf.arrayBuffer()), absUrl, title ?? `arXiv ${id}`);
  return { ...src, kind: 'url', docType: 'paper', title: title ?? src.title, source: absUrl, byline };
}

function segmentHtml(content: string) {
  const { document } = parseHTML(`<!doctype html><html><body>${content}</body></html>`);
  const sel = 'h1, h2, h3, h4, p, li, pre, blockquote, figcaption, td';
  const paras: { heading?: string; text: string }[] = [];
  let heading: string | undefined;
  for (const el of Array.from(document.querySelectorAll(sel)) as Element[]) {
    if (el.parentElement?.closest(sel)) continue;
    const text = clean(el.textContent ?? '');
    if (!text) continue;
    if (/^h[1-4]$/i.test(el.tagName)) heading = text;
    else paras.push({ heading, text: el.tagName.toLowerCase() === 'li' ? `• ${text}` : text });
  }
  return mergeParagraphs(paras);
}

function titleFromUrl(url: string) {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? u.host);
    return last.replace(/\.(pdf|html?)$/i, '').replace(/[-_]+/g, ' ');
  } catch {
    return url;
  }
}

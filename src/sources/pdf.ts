import * as path from 'path';
import { Worker } from 'worker_threads';
import type { LoadedSource } from './index';
import type { PdfWorkerResult } from './pdfWorker';
import { numbered, segmentPlainText } from './segment';

const TIMEOUT_MS = 90_000;

function extract(bytes: Uint8Array): Promise<{ pages: string[]; title?: string }> {
  // Copy into a standalone buffer so it can be transferred to the worker.
  const buffer = bytes.slice().buffer;
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'pdfWorker.js'), { workerData: { bytes: buffer }, transferList: [buffer] });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Reading the PDF took too long.'));
    }, TIMEOUT_MS);
    worker.once('message', (r: PdfWorkerResult) => {
      clearTimeout(timer);
      worker.terminate();
      if (r.ok && r.pages) resolve({ pages: r.pages, title: r.title });
      else reject(new Error(`Could not read the PDF: ${r.error ?? 'unknown error'}`));
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not read the PDF: ${err.message}`));
    });
  });
}

export async function loadPdfBytes(bytes: Uint8Array, source: string, fallbackTitle: string): Promise<LoadedSource> {
  const { pages, title: metaTitle } = await extract(bytes);
  const full = pages.join('\n\n');
  if (full.replace(/\s/g, '').length < 200) {
    throw new Error('This PDF has almost no extractable text (it may be a scanned image). Try a text-based PDF or paste the text.');
  }

  const title =
    metaTitle && metaTitle.length > 8 && !/^(untitled|microsoft word|document)/i.test(metaTitle) ? metaTitle : guessTitle(pages[0]) ?? fallbackTitle;
  const segments = numbered(segmentPlainText(full));
  const isPatent = /\b(claims?|embodiment|wherein)\b/i.test(full.slice(0, 20000)) && /\bpatent\b/i.test(full.slice(0, 4000));
  return { title, kind: 'pdf', docType: isPatent ? 'patent' : 'paper', source, segments };
}

function guessTitle(firstPage?: string): string | undefined {
  if (!firstPage) return undefined;
  const lines = firstPage.split('\n').map((l) => l.trim());
  const start = lines.findIndex((l) => l.length > 12 && l.length < 160 && !/^(arxiv|preprint|proceedings|copyright|provided proper)/i.test(l));
  if (start === -1) return undefined;
  // Titles often wrap onto a second line; author lines have commas, emails or affiliation marks.
  let title = lines[start];
  const next = lines[start + 1];
  if (next && next.length > 3 && !/[.,@∗*†‡\d]/.test(next) && !/[.:]$/.test(title) && (title + next).length < 160) title = `${title} ${next}`;
  return title;
}

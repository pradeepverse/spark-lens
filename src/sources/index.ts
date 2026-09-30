import * as vscode from 'vscode';
import * as path from 'path';
import type { DocType, Segment, SourceKind } from '../shared/types';
import type { IngestKind } from '../shared/protocol';
import { loadPdfBytes } from './pdf';
import { loadPatent, normalizePatentNumber, patentNumberFromUrl } from './patent';
import { numbered, segmentPlainText } from './segment';
import { loadUrl } from './web';

export interface LoadedSource {
  title: string;
  kind: SourceKind;
  docType: DocType;
  source: string;
  segments: Segment[];
  byline?: string;
}

export interface Detected {
  kind: Exclude<IngestKind, 'auto'>;
  value: string;
}

export function detect(input: string, kind: IngestKind = 'auto'): Detected {
  const value = input.trim();
  if (kind !== 'auto') return { kind, value };
  if (/^https?:\/\//i.test(value) && !/\s/.test(value)) return { kind: 'url', value };
  if (value.length < 40 && normalizePatentNumber(value)) return { kind: 'patent', value };
  if (/\.pdf$/i.test(value) && !/\n/.test(value) && value.length < 400) return { kind: 'pdf', value };
  return { kind: 'text', value };
}

export async function loadSource(d: Detected): Promise<LoadedSource> {
  switch (d.kind) {
    case 'url': {
      const patent = patentNumberFromUrl(d.value);
      return patent ? loadPatent(patent) : loadUrl(d.value);
    }
    case 'patent': {
      const n = normalizePatentNumber(d.value);
      if (!n) throw new Error(`"${d.value}" doesn't look like a patent number. Try a format like US10133916B2 or EP3456789A1.`);
      return loadPatent(n);
    }
    case 'pdf': {
      const uri = d.value.includes('://') ? vscode.Uri.parse(d.value) : vscode.Uri.file(d.value);
      const bytes = await vscode.workspace.fs.readFile(uri);
      return loadPdfBytes(bytes, uri.fsPath, path.basename(uri.fsPath, '.pdf'));
    }
    case 'text': {
      if (d.value.split(/\s+/).length < 40) throw new Error('That text is quite short. Paste at least a paragraph (40+ words) so Spark Lens has something to explain.');
      const firstLine = d.value.split('\n').find((l) => l.trim())?.trim() ?? 'Pasted text';
      return {
        title: firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine,
        kind: 'text',
        docType: /\bwherein\b|\bclaim \d/i.test(d.value) ? 'patent' : 'text',
        source: 'Pasted text',
        segments: numbered(segmentPlainText(d.value)),
      };
    }
  }
}

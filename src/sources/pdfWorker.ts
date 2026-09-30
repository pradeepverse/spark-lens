// Runs pdf.js in a worker thread. The extension host guards some globals (like `navigator`)
// that pdf.js touches on load; a worker has its own clean global scope and keeps parsing off
// the extension host's main thread.
import { parentPort, workerData } from 'worker_threads';
import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfWorkerResult {
  ok: boolean;
  pages?: string[];
  title?: string;
  error?: string;
}

(async () => {
  let result: PdfWorkerResult;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(workerData.bytes as ArrayBuffer));
    const { text } = await extractText(pdf, { mergePages: false });
    let title: string | undefined;
    try {
      title = ((await pdf.getMetadata()).info as { Title?: string } | undefined)?.Title?.trim();
    } catch {
      // Metadata is optional.
    }
    result = { ok: true, pages: Array.isArray(text) ? text : [text], title };
  } catch (err) {
    result = { ok: false, error: (err as Error).message };
  }
  parentPort?.postMessage(result);
})();

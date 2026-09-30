const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 SparkLens';

export class FetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function get(url: string, opts: { retries?: number; timeoutMs?: number; accept?: string } = {}): Promise<Response> {
  const { retries = 1, timeoutMs = 30000 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1200 * attempt));
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: opts.accept ?? 'text/html,application/pdf,application/xhtml+xml,*/*;q=0.8' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      lastErr = new FetchError(`${new URL(url).host} answered ${res.status} ${res.statusText}`.trim(), res.status);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr instanceof FetchError) throw lastErr;
  throw new FetchError(`Could not reach ${new URL(url).host}: ${(lastErr as Error)?.message ?? 'network error'}`);
}

export const isPdfResponse = (res: Response, url: string) =>
  (res.headers.get('content-type') ?? '').includes('pdf') || /\.pdf($|\?)/i.test(url);

export function decodeEntities(s: string) {
  return s
    .replace(/&hellip;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '');
}

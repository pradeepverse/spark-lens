import { XMLParser } from 'fast-xml-parser';
import type { Feed, FeedItem } from './shared/types';
import { decodeEntities, get } from './sources/http';

const PER_SOURCE = 3;
const MAX_INTERESTS = 6;

export async function buildFeed(interests: string[]): Promise<Feed> {
  const picked = interests.slice(0, MAX_INTERESTS);
  const errors: string[] = [];
  const results = await Promise.all(
    picked.map(async (interest) => {
      const [papers, pats] = await Promise.all([
        arxiv(interest).catch((e) => (errors.push(`arXiv: ${e.message}`), [] as FeedItem[])),
        searchPatents(interest).catch((e) => (errors.push(`Patents: ${e.message}`), [] as FeedItem[])),
      ]);
      return interleave(papers, pats);
    }),
  );
  // Round-robin across interests so each one shows up near the top.
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; results.some((r) => i < r.length); i++) {
    for (const r of results) {
      const item = r[i];
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }
  return {
    fetchedAt: Date.now(),
    interests: picked,
    items,
    error: items.length === 0 && errors.length ? [...new Set(errors)].join(' · ') : undefined,
  };
}

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

async function arxiv(interest: string): Promise<FeedItem[]> {
  const words = interest.trim().split(/\s+/).filter(Boolean).map(encodeURIComponent);
  const q = words.length > 1 ? `all:%22${words.join('+')}%22` : `all:${words[0]}`;
  const url = `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=${PER_SOURCE}`;
  const xml = await (await get(url, { accept: 'application/atom+xml' })).text();
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const entries = [parsed?.feed?.entry ?? []].flat();
  return entries.map((e: Record<string, unknown>) => {
    const id = String(e.id ?? '').replace(/^https?:\/\/arxiv\.org\/abs\//, '');
    const authors = [e.author ?? []].flat().map((a) => (a as { name: string }).name);
    return {
      kind: 'paper' as const,
      id: `arxiv:${id}`,
      title: String(e.title ?? '').replace(/\s+/g, ' ').trim(),
      summary: String(e.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 320),
      url: `https://arxiv.org/abs/${id.replace(/v\d+$/, '')}`,
      date: String(e.published ?? '').slice(0, 10),
      interest,
      byline: authors.length ? `${authors.slice(0, 2).join(', ')}${authors.length > 2 ? ' et al.' : ''}` : undefined,
    };
  });
}

async function searchPatents(interest: string): Promise<FeedItem[]> {
  const after = new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const query = `q=(${encodeURIComponent(`"${interest}"`)})&num=${PER_SOURCE + 2}&language=ENGLISH&type=PATENT&after=priority:${after}`;
  const res = await get(`https://patents.google.com/xhr/query?url=${encodeURIComponent(query)}&exp=`, { accept: 'application/json' });
  const json = (await res.json()) as { results?: { cluster?: { result?: { patent: Record<string, string> }[] }[] } };
  const rows = json.results?.cluster?.[0]?.result ?? [];
  return rows
    .map(({ patent }) => ({
      kind: 'patent' as const,
      id: `patent:${patent.publication_number}`,
      title: decodeEntities(patent.title ?? '').trim(),
      summary: decodeEntities(patent.snippet ?? '').trim().slice(0, 320),
      url: `https://patents.google.com/patent/${patent.publication_number}/en`,
      date: patent.priority_date ?? patent.publication_date,
      interest,
      byline: decodeEntities(patent.assignee ?? '').trim() || undefined,
    }))
    .filter((p) => p.title)
    // Prefer English-language originals (US/EP/WO) over machine translations.
    .sort((a, b) => Number(/^patent:(US|EP|WO)/.test(b.id)) - Number(/^patent:(US|EP|WO)/.test(a.id)))
    .slice(0, PER_SOURCE);
}

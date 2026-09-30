import * as vscode from 'vscode';
import type { DocMeta, Feed, LayerContent, PersonalGlossaryEntry, Profile, SparkDoc } from './shared/types';

const INDEX_KEY = 'sparkLens.library';
const PROFILE_KEY = 'sparkLens.profile';
const GLOSSARY_KEY = 'sparkLens.glossary';
const FEED_KEY = 'sparkLens.feed';
const ACTIVE_KEY = 'sparkLens.activeDoc';

const DEFAULT_PROFILE: Profile = {
  interests: [],
  onboarded: false,
  streak: { count: 0, best: 0 },
  readyBadges: 0,
  fontScale: 1,
};

/** Local-only persistence: an index in globalState, one JSON file per document. */
export class Library {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly docCache = new Map<string, SparkDoc>();

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  private get dir() {
    return vscode.Uri.joinPath(this.ctx.globalStorageUri, 'docs');
  }

  private file(id: string) {
    return vscode.Uri.joinPath(this.dir, `${id}.json`);
  }

  list(): DocMeta[] {
    return [...this.ctx.globalState.get<DocMeta[]>(INDEX_KEY, [])].sort((a, b) => b.openedAt - a.openedAt);
  }

  async load(id: string): Promise<SparkDoc | undefined> {
    const cached = this.docCache.get(id);
    if (cached) return cached;
    try {
      const bytes = await vscode.workspace.fs.readFile(this.file(id));
      const doc = JSON.parse(Buffer.from(bytes).toString('utf8')) as SparkDoc;
      this.docCache.set(id, doc);
      return doc;
    } catch {
      return undefined;
    }
  }

  async save(doc: SparkDoc) {
    this.docCache.set(doc.meta.id, doc);
    await vscode.workspace.fs.createDirectory(this.dir);
    await vscode.workspace.fs.writeFile(this.file(doc.meta.id), Buffer.from(JSON.stringify(doc), 'utf8'));
    const index = this.list().filter((m) => m.id !== doc.meta.id);
    index.unshift(doc.meta);
    await this.ctx.globalState.update(INDEX_KEY, index);
    this.changed.fire();
  }

  async remove(id: string) {
    this.docCache.delete(id);
    await this.ctx.globalState.update(INDEX_KEY, this.list().filter((m) => m.id !== id));
    const glossary = this.glossary().filter((g) => g.docId !== id);
    await this.ctx.globalState.update(GLOSSARY_KEY, glossary);
    try {
      await vscode.workspace.fs.delete(this.file(id));
    } catch {
      // Already gone.
    }
    if (this.activeDocId === id) await this.setActive(undefined);
    this.changed.fire();
  }

  findBySource(source: string): DocMeta | undefined {
    return this.list().find((m) => m.source === source && m.kind !== 'text');
  }

  get activeDocId(): string | undefined {
    return this.ctx.globalState.get<string>(ACTIVE_KEY);
  }

  async setActive(id: string | undefined) {
    await this.ctx.globalState.update(ACTIVE_KEY, id);
  }

  profile(): Profile {
    return { ...DEFAULT_PROFILE, ...this.ctx.globalState.get<Profile>(PROFILE_KEY) };
  }

  async updateProfile(patch: Partial<Profile>) {
    await this.ctx.globalState.update(PROFILE_KEY, { ...this.profile(), ...patch });
    this.changed.fire();
  }

  /** Counts today toward the reading streak. */
  async touchStreak() {
    const p = this.profile();
    const today = dayKey(new Date());
    if (p.streak.lastDay === today) return;
    const yesterday = dayKey(new Date(Date.now() - 864e5));
    const count = p.streak.lastDay === yesterday ? p.streak.count + 1 : 1;
    await this.updateProfile({ streak: { count, best: Math.max(count, p.streak.best), lastDay: today } });
  }

  glossary(): PersonalGlossaryEntry[] {
    return this.ctx.globalState.get<PersonalGlossaryEntry[]>(GLOSSARY_KEY, []);
  }

  async addToGlossary(doc: SparkDoc, layer: LayerContent) {
    const entries = this.glossary().filter(
      (g) => !(g.docId === doc.meta.id && layer.glossary.some((n) => n.term.toLowerCase() === g.term.toLowerCase())),
    );
    for (const g of layer.glossary) entries.push({ ...g, layer: layer.layer, docId: doc.meta.id, docTitle: doc.meta.title });
    await this.ctx.globalState.update(GLOSSARY_KEY, entries);
  }

  feed(): Feed | undefined {
    return this.ctx.globalState.get<Feed>(FEED_KEY);
  }

  async setFeed(feed: Feed) {
    await this.ctx.globalState.update(FEED_KEY, feed);
    this.changed.fire();
  }
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

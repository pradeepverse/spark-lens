import * as vscode from 'vscode';
import { buildFeed } from './discovery';
import { SparkEngine } from './engine';
import { Library } from './library';
import { ModelService } from './llm/models';
import type { HomeState, IngestKind } from './shared/protocol';
import type { SparkDoc } from './shared/types';
import { detect } from './sources';
import { ReaderPanel } from './webview/readerPanel';

const FEED_TTL = 12 * 3600 * 1000;

/** Shared services and the user flows that several entry points (sidebar, commands, chat) reuse. */
export class SparkApp implements vscode.Disposable {
  readonly library: Library;
  readonly models = new ModelService();
  readonly engine: SparkEngine;
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when anything shown on the Home view changes. */
  readonly onDidChange = this.changed.event;
  busy?: string;
  feedLoading = false;

  constructor(readonly ctx: vscode.ExtensionContext) {
    this.library = new Library(ctx);
    this.engine = new SparkEngine(this.library);
    ctx.subscriptions.push(
      this.models,
      this.library.onDidChange(() => this.changed.fire()),
      this.models.onDidChange(() => this.changed.fire()),
    );
  }

  async homeState(): Promise<HomeState> {
    const models = await this.models.listInfo();
    return {
      library: this.library.list(),
      profile: this.library.profile(),
      feed: this.library.feed(),
      feedLoading: this.feedLoading,
      models,
      modelId: await this.models.currentId(),
      copilotMissing: models.length === 0,
      busy: this.busy,
    };
  }

  private setBusy(label: string | undefined) {
    this.busy = label;
    this.changed.fire();
  }

  /** Loads a source with visible progress, then opens it in a Reading Room. */
  async ingest(value: string, kind: IngestKind = 'auto'): Promise<SparkDoc | undefined> {
    const d = detect(value, kind);
    const label = { url: 'Fetching the page', patent: 'Looking up the patent', pdf: 'Extracting the PDF', text: 'Preparing your text' }[d.kind];
    this.setBusy(label);
    try {
      const doc = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Spark Lens: ${label}…` },
        () => this.engine.ingest(d),
      );
      await this.openDoc(doc.meta.id);
      return doc;
    } catch (err) {
      this.setBusy(undefined);
      const message = (err as Error).message;
      const actions = d.kind === 'patent' || /patent/i.test(message) ? ['Open PDF…'] : [];
      // Don't block on the notification: the sidebar should be usable right away.
      void vscode.window.showErrorMessage(`Spark Lens: ${message}`, ...actions).then((pick) => {
        if (pick === 'Open PDF…') void this.pickPdf();
      });
      return undefined;
    } finally {
      this.setBusy(undefined);
    }
  }

  async pickPdf() {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'PDF documents': ['pdf'] },
      openLabel: 'Spark it',
      title: 'Choose a paper, patent or whitepaper',
    });
    if (picked?.[0]) await this.ingest(picked[0].toString(), 'pdf');
  }

  async openDoc(id: string) {
    const doc = await this.library.load(id);
    if (!doc) {
      vscode.window.showErrorMessage('Spark Lens: that document is no longer in your library.');
      return;
    }
    await this.engine.touch(doc);
    ReaderPanel.show(this, doc);
  }

  async deleteDoc(id: string) {
    const meta = this.library.list().find((m) => m.id === id);
    const ok = await vscode.window.showWarningMessage(
      `Remove "${meta?.title ?? 'this document'}" and its layers, notes and progress from your library?`,
      { modal: true },
      'Remove',
    );
    if (ok !== 'Remove') return;
    ReaderPanel.close(id);
    await this.library.remove(id);
  }

  async setInterests(interests: string[]) {
    await this.library.updateProfile({ interests, onboarded: true });
    await this.refreshFeed(true);
  }

  async refreshFeed(force = false) {
    const profile = this.library.profile();
    const cached = this.library.feed();
    if (!profile.interests.length) return;
    const same = cached && cached.interests.join('|') === profile.interests.slice(0, 6).join('|');
    if (!force && cached && same && Date.now() - cached.fetchedAt < FEED_TTL) return;
    this.feedLoading = true;
    this.changed.fire();
    try {
      await this.library.setFeed(await buildFeed(profile.interests));
    } finally {
      this.feedLoading = false;
      this.changed.fire();
    }
  }

  dispose() {
    this.changed.dispose();
  }
}

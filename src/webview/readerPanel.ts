import * as vscode from 'vscode';
import type { SparkApp } from '../app';
import { CopilotMissingError } from '../llm/models';
import { friendlyError } from '../llm/request';
import { LAYER_COUNT } from '../shared/layers';
import type { Stage, ToHost, ToWebview } from '../shared/protocol';
import type { SparkDoc } from '../shared/types';
import { renderHtml, webviewOptions } from './html';

/** One Reading Room per document. */
export class ReaderPanel {
  private static readonly panels = new Map<string, ReaderPanel>();

  static show(app: SparkApp, doc: SparkDoc) {
    const existing = this.panels.get(doc.meta.id);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }
    const panel = vscode.window.createWebviewPanel('sparkLens.reader', short(doc.meta.title), vscode.ViewColumn.Active, {
      ...webviewOptions(app.ctx.extensionUri),
      retainContextWhenHidden: true,
      enableFindWidget: true,
    });
    const reader = new ReaderPanel(app, panel, doc);
    this.panels.set(doc.meta.id, reader);
    return reader;
  }

  static close(id: string) {
    this.panels.get(id)?.panel.dispose();
  }

  static get(id: string) {
    return this.panels.get(id);
  }

  private stage: Stage = 'idle';
  private stageDetail?: string;
  private error?: string;
  private readonly ops = new Set<vscode.CancellationTokenSource>();
  private readonly subs: vscode.Disposable[] = [];

  private constructor(private readonly app: SparkApp, readonly panel: vscode.WebviewPanel, private doc: SparkDoc) {
    panel.iconPath = vscode.Uri.joinPath(app.ctx.extensionUri, 'media', 'spark.svg');
    panel.webview.html = renderHtml(panel.webview, app.ctx.extensionUri, 'reader', doc.meta.id);
    this.subs.push(
      panel.webview.onDidReceiveMessage((m: ToHost) => this.onMessage(m).catch((e) => this.toast((e as Error).message))),
      panel.onDidChangeViewState(() => panel.active && this.app.library.setActive(this.doc.meta.id)),
      app.models.onDidChange(() => this.push()),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  private post(m: ToWebview) {
    this.panel.webview.postMessage(m);
  }

  private toast(message: string, kind: 'info' | 'error' = 'error') {
    this.post({ type: 'toast', kind, message });
  }

  private async push() {
    this.post({
      type: 'reader',
      state: {
        doc: this.doc,
        profile: this.app.library.profile(),
        glossary: this.app.library.glossary(),
        models: await this.app.models.listInfo(),
        modelId: await this.app.models.currentId(),
        stage: this.stage,
        stageDetail: this.stageDetail,
        error: this.error,
      },
    });
  }

  /** Runs a cancellable Copilot operation. */
  private async run<T>(fn: (model: vscode.LanguageModelChat, token: vscode.CancellationToken) => Promise<T>): Promise<T | undefined> {
    const cts = new vscode.CancellationTokenSource();
    this.ops.add(cts);
    try {
      const model = await this.app.models.require();
      return await fn(model, cts.token);
    } finally {
      this.ops.delete(cts);
      cts.dispose();
    }
  }

  /** Returns true when the document is analyzed and ready for layers. */
  private async prepare(): Promise<boolean> {
    if (this.doc.analysis) {
      this.stage = 'ready';
      return true;
    }
    this.error = undefined;
    try {
      await this.run((model, token) =>
        this.app.engine.prepare(this.doc, model, token, (stage, detail) => {
          this.stage = stage;
          this.stageDetail = detail;
          this.push();
        }),
      );
    } catch (err) {
      this.stage = 'error';
      this.error = err instanceof CopilotMissingError || err instanceof vscode.CancellationError ? (err as Error).message : friendlyError(err).message;
    }
    this.panel.title = short(this.doc.meta.title);
    await this.push();
    return !!this.doc.analysis;
  }

  private async generateLayer(n: number, differently = false) {
    const p = this.doc.meta.progress;
    if (n < 1 || n > LAYER_COUNT || n > p.current) {
      this.post({ type: 'layerError', layer: n, message: 'This layer is still locked. Pass the previous quick check first.' });
      return;
    }
    this.post({ type: 'layerStart', layer: n });
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | undefined;
    try {
      const content = await this.run((model, token) =>
        this.app.engine.generateLayer(
          this.doc,
          n,
          model,
          token,
          (body) => {
            // Throttle UI updates while streaming.
            clearTimeout(pending);
            const send = () => {
              last = Date.now();
              this.post({ type: 'layerChunk', layer: n, text: body });
            };
            if (Date.now() - last > 60) send();
            else pending = setTimeout(send, 60);
          },
          differently,
        ),
      );
      clearTimeout(pending);
      if (content) this.post({ type: 'layerDone', layer: n, content });
      await this.push();
    } catch (err) {
      clearTimeout(pending);
      const message = err instanceof vscode.CancellationError ? 'Stopped.' : friendlyError(err).message;
      this.post({ type: 'layerError', layer: n, message });
    }
  }

  private async onMessage(m: ToHost) {
    switch (m.type) {
      case 'ready':
        // The webview asks for layers itself once the document is ready.
        await this.push();
        await this.prepare();
        break;
      case 'retryPrepare':
        this.stage = 'idle';
        await this.push();
        await this.prepare();
        break;
      case 'generateLayer':
        await this.generateLayer(m.layer, m.differently);
        break;
      case 'quizResult': {
        const r = await this.app.engine.recordQuiz(this.doc, m.layer, m.correct, m.total, m.skipped);
        await this.push();
        if (r.becameReady) this.post({ type: 'celebrate', kind: 'ready' });
        else if (r.passed) this.post({ type: 'celebrate', kind: 'pass', layer: m.layer });
        break;
      }
      case 'ask':
        try {
          const note = await this.run((model, token) =>
            this.app.engine.ask(
              this.doc,
              m.action,
              m.selection,
              m.layer,
              m.question,
              model,
              token,
              (n) => this.post({ type: 'askStart', note: n }),
              (id, text) => this.post({ type: 'askChunk', id, text }),
            ),
          );
          if (note) this.post({ type: 'askDone', note });
        } catch (err) {
          this.toast(friendlyError(err).message);
          await this.push();
        }
        break;
      case 'deleteNote':
        await this.app.engine.deleteNote(this.doc, m.id);
        await this.push();
        break;
      case 'loadGuide':
        if (this.doc.annotations && !m.regenerate) return;
        this.post({ type: 'guideStart' });
        try {
          await this.run((model, token) => this.app.engine.guide(this.doc, model, token));
          this.post({ type: 'guideDone' });
          await this.push();
        } catch (err) {
          this.post({ type: 'guideError', message: friendlyError(err).message });
        }
        break;
      case 'selectModel':
        await this.app.models.select(m.id);
        break;
      case 'setFontScale':
        await this.app.library.updateProfile({ fontScale: m.scale });
        break;
      case 'openExternal':
        vscode.env.openExternal(vscode.Uri.parse(m.url));
        break;
      case 'cancel':
        this.ops.forEach((c) => c.cancel());
        break;
    }
  }

  private dispose() {
    this.ops.forEach((c) => c.cancel());
    this.subs.forEach((d) => d.dispose());
    ReaderPanel.panels.delete(this.doc.meta.id);
  }
}

const short = (t: string) => (t.length > 42 ? `${t.slice(0, 40)}…` : t);

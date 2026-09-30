import * as vscode from 'vscode';
import type { SparkApp } from '../app';
import type { ToHost, ToWebview } from '../shared/protocol';
import { renderHtml, webviewOptions } from './html';

export class HomeViewProvider implements vscode.WebviewViewProvider {
  static readonly id = 'sparkLens.home';
  private view?: vscode.WebviewView;

  constructor(private readonly app: SparkApp) {
    app.onDidChange(() => this.push());
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = webviewOptions(this.app.ctx.extensionUri);
    view.webview.html = renderHtml(view.webview, this.app.ctx.extensionUri, 'home');
    view.webview.onDidReceiveMessage((m: ToHost) => this.onMessage(m));
    view.onDidChangeVisibility(() => view.visible && this.push());
    view.onDidDispose(() => (this.view = undefined));
  }

  private post(m: ToWebview) {
    this.view?.webview.postMessage(m);
  }

  private async push() {
    if (this.view) this.post({ type: 'home', state: await this.app.homeState() });
  }

  private async onMessage(m: ToHost) {
    const app = this.app;
    switch (m.type) {
      case 'ready':
        await this.push();
        app.refreshFeed().catch(() => undefined);
        break;
      case 'ingest':
        await app.ingest(m.value, m.kind);
        break;
      case 'pickPdf':
        await app.pickPdf();
        break;
      case 'openDoc':
        await app.openDoc(m.id);
        break;
      case 'deleteDoc':
        await app.deleteDoc(m.id);
        break;
      case 'setInterests':
        await app.setInterests(m.interests);
        break;
      case 'refreshFeed':
        await app.refreshFeed(true);
        break;
      case 'openExternal':
        vscode.env.openExternal(vscode.Uri.parse(m.url));
        break;
      case 'selectModel':
        await app.models.select(m.id);
        break;
    }
  }
}

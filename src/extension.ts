import * as vscode from 'vscode';
import { SparkApp } from './app';
import { registerChat } from './chat';
import { HomeViewProvider } from './webview/homeView';

export function activate(ctx: vscode.ExtensionContext) {
  const app = new SparkApp(ctx);
  ctx.subscriptions.push(app);

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(HomeViewProvider.id, new HomeViewProvider(app), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    registerChat(app),

    vscode.commands.registerCommand('sparkLens.openHome', () => vscode.commands.executeCommand(`${HomeViewProvider.id}.focus`)),

    vscode.commands.registerCommand('sparkLens.sparkUrl', async () => {
      const url = await vscode.window.showInputBox({
        title: 'Spark Lens: read an article, paper or patent page',
        prompt: 'Paste a URL: arXiv, Google Patents, a blog post, or a direct PDF link',
        placeHolder: 'https://arxiv.org/abs/1706.03762',
        validateInput: (v) => (/^https?:\/\/\S+$/i.test(v.trim()) ? undefined : 'Enter a full http(s) URL'),
      });
      if (url) await app.ingest(url, 'url');
    }),

    vscode.commands.registerCommand('sparkLens.sparkPatent', async () => {
      const n = await vscode.window.showInputBox({
        title: 'Spark Lens: look up a patent',
        prompt: 'Patent publication number',
        placeHolder: 'US10133916B2, EP3456789A1, WO2020123456A1',
      });
      if (n) await app.ingest(n, 'patent');
    }),

    vscode.commands.registerCommand('sparkLens.sparkPdf', async (uri?: vscode.Uri) => {
      if (uri instanceof vscode.Uri) await app.ingest(uri.toString(), 'pdf');
      else await app.pickPdf();
    }),

    vscode.commands.registerCommand('sparkLens.sparkSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      const text = editor?.document.getText(editor.selection).trim();
      if (!text) {
        vscode.window.showInformationMessage('Select some text first. A section, an abstract or a claim works well.');
        return;
      }
      await app.ingest(text, 'text');
    }),

    vscode.commands.registerCommand('sparkLens.openDoc', (id: string) => app.openDoc(id)),

    vscode.commands.registerCommand('sparkLens.selectModel', async () => {
      const models = await app.models.listInfo();
      if (!models.length) {
        vscode.window.showWarningMessage('No GitHub Copilot models are available. Install GitHub Copilot Chat and sign in.');
        return;
      }
      const current = await app.models.currentId();
      const pick = await vscode.window.showQuickPick(
        models.map((m) => ({
          label: m.name,
          description: m.id === current ? '(current)' : m.family,
          detail: `${Math.round(m.maxInputTokens / 1000)}k token context`,
          id: m.id,
        })),
        { title: 'Spark Lens: choose the Copilot model' },
      );
      if (pick) await app.models.select(pick.id);
    }),
  );
}

export function deactivate() {}

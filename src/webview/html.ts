import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

export function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
  };
}

/** HTML shell for the React app. `view` picks the screen; `docId` is set for Reading Rooms. */
export function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri, view: 'home' | 'reader', docId?: string) {
  const root = vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'assets');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(root, 'index.js'));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(root, 'index.css'));
  const nonce = randomBytes(16).toString('base64');
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
  ].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${style}" />
  <title>Spark Lens</title>
</head>
<body>
  <div id="root" data-view="${view}" data-doc="${docId ?? ''}"></div>
  <script type="module" nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

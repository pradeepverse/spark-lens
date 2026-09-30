import * as vscode from 'vscode';
import type { ModelInfo } from '../shared/types';

/**
 * Picks and remembers the GitHub Copilot model Spark Lens uses. Models come from the
 * VS Code Language Model API, so requests draw on the user's own Copilot entitlement.
 */
export class ModelService implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private cache?: vscode.LanguageModelChat[];
  private readonly subs: vscode.Disposable[] = [];

  constructor() {
    this.subs.push(
      vscode.lm.onDidChangeChatModels(() => {
        this.cache = undefined;
        this.changed.fire();
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('sparkLens.model')) this.changed.fire();
      }),
    );
  }

  async list(): Promise<vscode.LanguageModelChat[]> {
    if (!this.cache || this.cache.length === 0) {
      try {
        this.cache = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      } catch {
        this.cache = [];
      }
    }
    return this.cache;
  }

  async listInfo(): Promise<ModelInfo[]> {
    return (await this.list()).map(toInfo);
  }

  /** The chosen model, or a smart default when nothing is chosen or it disappeared. */
  async current(): Promise<vscode.LanguageModelChat | undefined> {
    const models = await this.list();
    if (models.length === 0) return undefined;
    const chosen = vscode.workspace.getConfiguration('sparkLens').get<string>('model');
    return models.find((m) => m.id === chosen) ?? pickDefault(models);
  }

  async currentId(): Promise<string | undefined> {
    return (await this.current())?.id;
  }

  async select(id: string) {
    await vscode.workspace.getConfiguration('sparkLens').update('model', id, vscode.ConfigurationTarget.Global);
  }

  async require(): Promise<vscode.LanguageModelChat> {
    const model = await this.current();
    if (!model) throw new CopilotMissingError();
    return model;
  }

  dispose() {
    this.subs.forEach((d) => d.dispose());
    this.changed.dispose();
  }
}

export class CopilotMissingError extends Error {
  constructor() {
    super('No GitHub Copilot model is available. Install GitHub Copilot Chat and sign in, then try again.');
  }
}

export function toInfo(m: vscode.LanguageModelChat): ModelInfo {
  return { id: m.id, name: m.name, family: m.family, vendor: m.vendor, maxInputTokens: m.maxInputTokens };
}

function pickDefault(models: vscode.LanguageModelChat[]): vscode.LanguageModelChat {
  const preferred = vscode.workspace
    .getConfiguration('sparkLens')
    .get<string[]>('preferredModelFamilies', []);
  for (const want of preferred) {
    const hit = models.find((m) => m.family.toLowerCase().includes(want.toLowerCase()));
    if (hit) return hit;
  }
  // Otherwise the model with the largest context window — long documents need it most.
  return [...models].sort((a, b) => b.maxInputTokens - a.maxInputTokens)[0];
}

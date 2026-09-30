import * as vscode from 'vscode';

export const META_DELIMITER = '===SPARK-META===';

/** Streams a single-prompt request and returns the full text. */
export async function streamText(
  model: vscode.LanguageModelChat,
  prompt: string,
  token: vscode.CancellationToken,
  onText?: (full: string) => void,
): Promise<string> {
  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  let response: vscode.LanguageModelChatResponse;
  try {
    response = await model.sendRequest(
      messages,
      { justification: 'Spark Lens uses Copilot to explain research papers and patents layer by layer.' },
      token,
    );
  } catch (err) {
    throw friendlyError(err);
  }
  let full = '';
  try {
    for await (const chunk of response.text) {
      full += chunk;
      onText?.(full);
    }
  } catch (err) {
    if (token.isCancellationRequested) throw new vscode.CancellationError();
    throw friendlyError(err);
  }
  return full;
}

export function friendlyError(err: unknown): Error {
  if (err instanceof vscode.CancellationError) return err;
  if (err instanceof vscode.LanguageModelError) {
    switch (err.code) {
      case vscode.LanguageModelError.NoPermissions.name:
        return new Error('Spark Lens needs permission to use GitHub Copilot. Allow it when VS Code asks, then try again.');
      case vscode.LanguageModelError.Blocked.name:
        return new Error('Copilot blocked this request (quota or rate limit). Wait a moment or pick another model.');
      case vscode.LanguageModelError.NotFound.name:
        return new Error('The selected Copilot model is no longer available. Pick another model.');
    }
    return new Error(`Copilot error: ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Splits streamed layer output into the visible markdown and the trailing JSON meta. */
export function splitMeta(full: string): { body: string; meta?: string } {
  const at = full.indexOf(META_DELIMITER);
  if (at === -1) {
    // Hide a partially streamed delimiter so it never flashes on screen.
    const partial = full.lastIndexOf('===');
    if (partial !== -1 && full.length - partial < META_DELIMITER.length) {
      return { body: full.slice(0, partial).trimEnd() };
    }
    return { body: full };
  }
  return { body: full.slice(0, at).trimEnd(), meta: full.slice(at + META_DELIMITER.length) };
}

/** Extracts the first JSON object or array from model output, tolerating code fences and chatter. */
export function parseJson<T>(text: string): T | undefined {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const starts = [cleaned.indexOf('{'), cleaned.indexOf('[')].filter((i) => i !== -1);
  if (starts.length === 0) return undefined;
  const start = Math.min(...starts);
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(close);
  if (end <= start) return undefined;
  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    try {
      // Common model slip: trailing commas.
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')) as T;
    } catch {
      return undefined;
    }
  }
}

export const approxTokens = (text: string) => Math.ceil(text.length / 4);

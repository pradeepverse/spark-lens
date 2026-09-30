// Minimal stand-in for the `vscode` module so engine tests run in plain Node.
const files = new Map<string, Uint8Array>();

export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  event = (l: (e: T) => void) => {
    this.listeners.push(l);
    return { dispose() {} };
  };
  fire(e: T) {
    this.listeners.forEach((l) => l(e));
  }
  dispose() {}
}

export class CancellationError extends Error {}
export class LanguageModelError extends Error {
  code = '';
  static NoPermissions = function NoPermissions() {};
  static Blocked = function Blocked() {};
  static NotFound = function NotFound() {};
}

export const LanguageModelChatMessage = { User: (content: string) => ({ role: 1, content }) };

export const Uri = {
  joinPath: (base: { path: string }, ...parts: string[]) => ({ path: [base.path, ...parts].join('/') }),
  file: (p: string) => ({ path: p, fsPath: p }),
  parse: (p: string) => ({ path: p, fsPath: p }),
};

export const workspace = {
  fs: {
    createDirectory: async () => undefined,
    writeFile: async (u: { path: string }, b: Uint8Array) => void files.set(u.path, b),
    readFile: async (u: { path: string }) => {
      const f = files.get(u.path);
      if (!f) throw new Error('not found');
      return f;
    },
    delete: async (u: { path: string }) => void files.delete(u.path),
  },
};

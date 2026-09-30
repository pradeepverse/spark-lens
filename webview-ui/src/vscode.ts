import { useEffect, useRef } from 'react';
import type { ToHost, ToWebview } from '../../src/shared/protocol';

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api: VsCodeApi =
  typeof acquireVsCodeApi === 'function'
    ? acquireVsCodeApi()
    : { postMessage: (m) => console.log('[post]', m), getState: () => undefined, setState: () => undefined };

export const post = (m: ToHost) => api.postMessage(m);

export function loadUiState<T>(fallback: T): T {
  return { ...fallback, ...(api.getState<Partial<T>>() ?? {}) };
}

export function saveUiState<T>(state: T) {
  api.setState(state);
}

export function useHost(handler: (m: ToWebview) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (e: MessageEvent<ToWebview>) => ref.current(e.data);
    window.addEventListener('message', listener);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);
}

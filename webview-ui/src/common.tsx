import { useEffect, useState } from 'react';
import type { ModelInfo } from '../../src/shared/types';
import { Close } from './icons';

export function ModelPicker({ models, modelId, onSelect, compact }: { models: ModelInfo[]; modelId?: string; onSelect: (id: string) => void; compact?: boolean }) {
  if (!models.length) return <span className="model-missing" title="Install GitHub Copilot Chat and sign in">Copilot unavailable</span>;
  return (
    <label className={`model-picker ${compact ? 'compact' : ''}`} title="GitHub Copilot model used by Spark Lens">
      {!compact && <span className="model-label">Model</span>}
      <select value={modelId} onChange={(e) => onSelect(e.target.value)}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface Toast {
  id: number;
  kind: 'info' | 'error';
  message: string;
}

let toastSeq = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (kind: Toast['kind'], message: string) => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000);
  };
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  return { toasts, push, dismiss };
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span>{t.message}</span>
          <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss"><Close size={12} /></button>
        </div>
      ))}
    </div>
  );
}

/** A burst of sparks for moments worth celebrating. */
export function SparkBurst({ count = 18 }: { count?: number }) {
  const [parts] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      angle: (360 / count) * i + Math.random() * 12,
      dist: 70 + Math.random() * 90,
      delay: Math.random() * 0.15,
      size: 4 + Math.random() * 6,
    })),
  );
  return (
    <div className="burst-wrap" aria-hidden>
      {parts.map((p, i) => (
        <span
          key={i}
          className="burst-dot"
          style={{ '--a': `${p.angle}deg`, '--d': `${p.dist}px`, '--s': `${p.size}px`, animationDelay: `${p.delay}s` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function timeAgo(ts: number, now = Date.now()) {
  const s = Math.max(1, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

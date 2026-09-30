import { useEffect, useMemo, useState } from 'react';
import { layerDef } from '../../../src/shared/layers';
import type { Annotation, AnnotationKind, SparkDoc } from '../../../src/shared/types';
import { External, Refresh } from '../icons';
import { RichText, type MarkdownEnv } from './Markdown';

interface Props {
  doc: SparkDoc;
  env: MarkdownEnv;
  guide: 'idle' | 'loading' | 'error';
  guideError?: string;
  focusSegment?: string;
  onRegenerate: () => void;
  onRetry: () => void;
  onLayer: (n: number) => void;
  onOpenSource: () => void;
}

const KINDS: { kind: AnnotationKind; label: string; hint: string }[] = [
  { kind: 'key', label: 'Key', hint: 'Load-bearing passages' },
  { kind: 'tricky', label: 'Tricky', hint: 'Dense passages, with a decoder' },
  { kind: 'claim', label: 'Claim', hint: 'Independent patent claims' },
  { kind: 'skim', label: 'Skim', hint: 'Safe to skim' },
];

export function Original({ doc, env, guide, guideError, focusSegment, onRegenerate, onRetry, onLayer, onOpenSource }: Props) {
  const [hidden, setHidden] = useState<Set<AnnotationKind>>(new Set());
  const [onlyAnnotated, setOnlyAnnotated] = useState(false);
  const byId = useMemo(() => {
    const m = new Map<string, Annotation>();
    doc.annotations?.forEach((a) => m.set(a.segmentId, a));
    return m;
  }, [doc.annotations]);
  const present = new Set(doc.annotations?.map((a) => a.kind));

  useEffect(() => {
    if (!focusSegment) return;
    const el = document.getElementById(focusSegment);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('flash');
    const t = setTimeout(() => el?.classList.remove('flash'), 1800);
    return () => clearTimeout(t);
  }, [focusSegment]);

  let lastHeading: string | undefined;
  return (
    <div className="original">
      <header className="layer-head">
        <div className="eyebrow">The original · annotated</div>
        <h1 className="layer-title">{doc.analysis?.title ?? doc.meta.title}</h1>
        <p className="layer-blurb">
          You have climbed the ladder. Read the real thing now, with margin notes pointing back to what you learned.
          {doc.meta.byline && <span className="muted"> · {doc.meta.byline}</span>}
        </p>
        <div className="orig-tools">
          {KINDS.filter((k) => present.has(k.kind)).map((k) => (
            <button
              key={k.kind}
              className={`filter-chip k-${k.kind} ${hidden.has(k.kind) ? 'off' : ''}`}
              title={k.hint}
              onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(k.kind)) n.delete(k.kind); else n.add(k.kind); return n; })}
            >
              <i /> {k.label}
            </button>
          ))}
          {doc.annotations && (
            <label className="toggle">
              <input type="checkbox" checked={onlyAnnotated} onChange={(e) => setOnlyAnnotated(e.target.checked)} /> Annotated passages only
            </label>
          )}
          <div className="spacer" />
          {doc.annotations && guide !== 'loading' && (
            <button className="btn btn-ghost btn-sm" onClick={onRegenerate} title="Ask Copilot for a fresh set of notes"><Refresh size={13} /> Re-annotate</button>
          )}
          {doc.meta.source.startsWith('http') && (
            <button className="btn btn-ghost btn-sm" onClick={onOpenSource}><External size={13} /> Source</button>
          )}
        </div>
        {guide === 'loading' && <div className="guide-loading"><span className="shimmer-line" /> Spark is reading alongside you and writing margin notes…</div>}
        {guide === 'error' && (
          <div className="callout callout-error">
            {guideError} <button className="btn btn-ghost btn-sm" onClick={onRetry}>Retry</button>
          </div>
        )}
      </header>

      <div className="orig-body">
        {doc.segments.map((s) => {
          const a = byId.get(s.id);
          const visible = a && !hidden.has(a.kind);
          if (onlyAnnotated && !visible) return null;
          const showHeading = s.heading && s.heading !== lastHeading;
          lastHeading = s.heading ?? lastHeading;
          return (
            <div key={s.id} className="orig-row-wrap">
              {showHeading && <h3 className="orig-heading">{s.heading}</h3>}
              <div id={s.id} className={`orig-row ${visible ? `has-note k-${a!.kind}` : ''} ${s.role === 'claim' ? 'is-claim' : ''}`}>
                <div className="orig-text prose">
                  <span className="seg-id" aria-hidden>{s.id.slice(1)}</span>
                  <RichText text={s.text} env={env} />
                </div>
                <div className="orig-margin">
                  {visible && (
                    <div className={`margin-note k-${a!.kind}`}>
                      <div className="margin-kind">{KINDS.find((k) => k.kind === a!.kind)?.label}</div>
                      <p>{a!.note}</p>
                      <button className="link-btn" onClick={() => onLayer(a!.layer)}>
                        Revisit Layer {a!.layer} · {layerDef(a!.layer)?.name}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

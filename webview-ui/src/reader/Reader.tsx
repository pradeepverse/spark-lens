import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LAYER_COUNT, ORIGINAL, layerDef } from '../../../src/shared/layers';
import type { ReaderState } from '../../../src/shared/protocol';
import type { AskAction, SparkNote } from '../../../src/shared/types';
import { ModelPicker, SparkBurst, Toasts, useToasts } from '../common';
import { Arrow, Book, Check, Medal, Panel, SparkMark } from '../icons';
import { loadUiState, post, saveUiState, useHost } from '../vscode';
import { Ladder } from './Ladder';
import { LayerView } from './LayerView';
import type { MarkdownEnv, TermDef } from './Markdown';
import { Original } from './Original';
import { SelectionToolbar } from './SelectionToolbar';
import { SidePanel, type PanelTab } from './SidePanel';

interface UiState {
  view: number;
  panelOpen: boolean;
  panelTab: PanelTab;
}

export function Reader() {
  const saved = useMemo(() => loadUiState<UiState>({ view: 0, panelOpen: true, panelTab: 'about' }), []);
  const [rs, setRs] = useState<ReaderState>();
  const [view, setView] = useState(saved.view);
  const [panelOpen, setPanelOpen] = useState(saved.panelOpen);
  const [panelTab, setPanelTab] = useState<PanelTab>(saved.panelTab);
  const [streams, setStreams] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [layerErrors, setLayerErrors] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<Record<string, SparkNote>>({});
  const [guide, setGuide] = useState<'idle' | 'loading' | 'error'>('idle');
  const [guideError, setGuideError] = useState<string>();
  const [celebrate, setCelebrate] = useState(false);
  const [burst, setBurst] = useState<number>();
  const [focusSeg, setFocusSeg] = useState<string>();
  const [scale, setScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toasts, push: toast, dismiss } = useToasts();

  const setGen = (n: number, on: boolean) =>
    setGenerating((g) => {
      const next = new Set(g);
      if (on) next.add(n);
      else next.delete(n);
      return next;
    });

  useHost((m) => {
    switch (m.type) {
      case 'reader':
        setRs(m.state);
        setScale(m.state.profile.fontScale || 1);
        setView((v) => (v === 0 ? m.state.doc.meta.progress.current : v));
        break;
      case 'layerStart':
        setGen(m.layer, true);
        setLayerErrors((e) => ({ ...e, [m.layer]: '' }));
        break;
      case 'layerChunk':
        setStreams((s) => ({ ...s, [m.layer]: m.text }));
        break;
      case 'layerDone':
        setRs((r) => (r ? { ...r, doc: { ...r.doc, layers: { ...r.doc.layers, [m.layer]: m.content } } } : r));
        setGen(m.layer, false);
        setStreams((s) => ({ ...s, [m.layer]: '' }));
        break;
      case 'layerError':
        setGen(m.layer, false);
        setStreams((s) => ({ ...s, [m.layer]: '' }));
        setLayerErrors((e) => ({ ...e, [m.layer]: m.message }));
        break;
      case 'askStart':
        setPending((p) => ({ ...p, [m.note.id]: m.note }));
        break;
      case 'askChunk':
        setPending((p) => (p[m.id] ? { ...p, [m.id]: { ...p[m.id], answer: m.text } } : p));
        break;
      case 'askDone':
        setPending((p) => {
          const { [m.note.id]: _, ...rest } = p;
          return rest;
        });
        setRs((r) => (r ? { ...r, doc: { ...r.doc, notes: [m.note, ...r.doc.notes.filter((n) => n.id !== m.note.id)] } } : r));
        break;
      case 'askError':
        setPending((p) => {
          const { [m.id]: _, ...rest } = p;
          return rest;
        });
        toast('error', m.message);
        break;
      case 'guideStart':
        setGuide('loading');
        break;
      case 'guideDone':
        setGuide('idle');
        break;
      case 'guideError':
        setGuide('error');
        setGuideError(m.message);
        break;
      case 'celebrate':
        if (m.kind === 'ready') setCelebrate(true);
        else {
          setBurst((m.layer ?? 0) + 1);
          setTimeout(() => setBurst(undefined), 1600);
        }
        break;
      case 'toast':
        // A failed ask leaves no askDone behind; clear streaming placeholders.
        if (m.kind === 'error') setPending({});
        toast(m.kind, m.message);
        break;
    }
  });

  useEffect(() => saveUiState<UiState>({ view, panelOpen, panelTab }), [view, panelOpen, panelTab]);

  const doc = rs?.doc;
  const progress = doc?.meta.progress;
  const ready = rs?.stage === 'ready' || !!doc?.analysis;

  // Keep the view inside the unlocked range.
  useEffect(() => {
    if (progress && view > progress.current) setView(progress.current);
  }, [progress, view]);

  // Write layers and the reading guide on demand.
  useEffect(() => {
    if (!doc || !ready || !progress || view === 0) return;
    if (view <= LAYER_COUNT && view <= progress.current && !doc.layers[view] && !generating.has(view) && !layerErrors[view]) {
      setGen(view, true);
      post({ type: 'generateLayer', layer: view });
    }
    if (view === ORIGINAL && !doc.annotations && guide === 'idle') {
      setGuide('loading');
      post({ type: 'loadGuide' });
    }
  }, [doc, ready, progress, view, generating, layerErrors, guide]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view]);

  const env: MarkdownEnv = useMemo(() => {
    const terms = new Map<string, TermDef>();
    if (doc) {
      const upTo = view >= ORIGINAL ? LAYER_COUNT : view;
      for (let n = 1; n <= upTo; n++) doc.layers[n]?.glossary.forEach((g) => terms.set(g.term.toLowerCase(), { ...g, layer: n }));
    }
    return {
      terms,
      segments: new Map(doc?.segments.map((s) => [s.id, s]) ?? []),
      onCite: (id: string) => {
        if (progress && progress.current >= ORIGINAL) {
          setView(ORIGINAL);
          setFocusSeg(undefined);
          setTimeout(() => setFocusSeg(id), 50);
        } else {
          toast('info', 'The annotated original unlocks after Layer 5. Hover a § link to peek at the passage.');
        }
      },
    };
  }, [doc, view, progress]);

  const allTerms = useMemo(() => {
    const m = new Map<string, TermDef>();
    if (doc) for (let n = 1; n <= LAYER_COUNT; n++) doc.layers[n]?.glossary.forEach((g) => m.set(g.term.toLowerCase(), { ...g, layer: n }));
    return [...m.values()];
  }, [doc]);

  const notes = useMemo(() => [...Object.values(pending).map((n) => ({ ...n, streaming: true })), ...(doc?.notes ?? [])], [pending, doc?.notes]);

  const ask = useCallback(
    (action: AskAction, selection: string, question?: string) => {
      post({ type: 'ask', action, selection, question, layer: view });
      setPanelOpen(true);
      setPanelTab('sparks');
    },
    [view],
  );

  const go = (n: number) => {
    if (!progress || n < 1 || n > progress.current) return;
    setView(n);
  };

  const changeScale = (delta: number) => {
    const next = Math.min(1.4, Math.max(0.8, Math.round((scale + delta) * 10) / 10));
    setScale(next);
    post({ type: 'setFontScale', scale: next });
  };

  // [ and ] move between layers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === ']') go(view + 1);
      if (e.key === '[') go(view - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!rs || !doc || !progress) {
    return (
      <div className="boot">
        <SparkMark size={28} className="pulse" />
      </div>
    );
  }

  const openSource = () => post({ type: 'openExternal', url: doc.meta.source });

  return (
    <div className="reader-app" style={{ '--scale': scale } as React.CSSProperties}>
      <header className="topbar">
        <span className="brand"><SparkMark size={16} /> Spark Lens</span>
        <span className="topbar-sep">/</span>
        <span className="topbar-title" title={doc.meta.title}>{doc.meta.title}</span>
        <div className="spacer" />
        <div className="font-ctl" role="group" aria-label="Text size">
          <button onClick={() => changeScale(-0.1)} title="Smaller text">A−</button>
          <button onClick={() => changeScale(0.1)} title="Larger text">A+</button>
        </div>
        <ModelPicker models={rs.models} modelId={rs.modelId} onSelect={(id) => post({ type: 'selectModel', id })} compact />
        <button className={`icon-btn ${panelOpen ? 'on' : ''}`} onClick={() => setPanelOpen((o) => !o)} title="Toggle companion panel">
          <Panel size={16} />
        </button>
      </header>

      <div className="reader-main">
        <Ladder progress={progress} view={view} generating={generating} profile={rs.profile} onSelect={go} burst={burst} />

        <div className="reader-scroll" ref={scrollRef}>
          <div className={`reader-column ${view === ORIGINAL ? 'wide' : ''}`}>
            {!ready ? (
              <Preparing rs={rs} />
            ) : view === ORIGINAL ? (
              <Original
                doc={doc}
                env={env}
                guide={guide}
                guideError={guideError}
                focusSegment={focusSeg}
                onRegenerate={() => { setGuide('loading'); post({ type: 'loadGuide', regenerate: true }); }}
                onRetry={() => { setGuide('loading'); post({ type: 'loadGuide', regenerate: true }); }}
                onLayer={go}
                onOpenSource={openSource}
              />
            ) : (
              <>
                {view === 1 && doc.analysis && <DocIntro rs={rs} />}
                <LayerView
                  n={view}
                  content={doc.layers[view]}
                  streamingText={streams[view]}
                  generating={generating.has(view)}
                  error={layerErrors[view]}
                  progress={progress}
                  env={env}
                  onGenerate={(differently) => {
                    setLayerErrors((e) => ({ ...e, [view]: '' }));
                    setGen(view, true);
                    post({ type: 'generateLayer', layer: view, differently });
                  }}
                  onCancel={() => post({ type: 'cancel' })}
                  onQuiz={(correct, total, skipped) => post({ type: 'quizResult', layer: view, correct, total, skipped })}
                  onContinue={() => setView(Math.min(view + 1, ORIGINAL))}
                />
              </>
            )}
          </div>
          <SelectionToolbar containerRef={scrollRef} onAsk={ask} />
        </div>

        {panelOpen && (
          <SidePanel
            tab={panelTab}
            onTab={setPanelTab}
            onClose={() => setPanelOpen(false)}
            notes={notes}
            onDeleteNote={(id) => post({ type: 'deleteNote', id })}
            terms={allTerms}
            meta={doc.meta}
            analysis={doc.analysis}
            env={env}
            onOpenSource={openSource}
          />
        )}
      </div>

      {celebrate && (
        <div className="celebrate" role="dialog" aria-modal="true" aria-label="Ready to read the original">
          <div className="celebrate-card">
            <SparkBurst count={26} />
            <div className="celebrate-medal"><Medal size={40} /></div>
            <h2>You’re ready for the original.</h2>
            <p>You climbed all five layers of <em>{doc.analysis?.title ?? doc.meta.title}</em>. The dense parts will read differently now, and your margin notes are waiting.</p>
            <div className="celebrate-actions">
              <button className="btn btn-primary" onClick={() => { setCelebrate(false); setView(ORIGINAL); }}>
                <Book size={15} /> Read the original
              </button>
              <button className="btn btn-ghost" onClick={() => setCelebrate(false)}>Stay here</button>
            </div>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

function DocIntro({ rs }: { rs: ReaderState }) {
  const a = rs.doc.analysis!;
  return (
    <section className="doc-intro">
      <div className="eyebrow">{a.domain || rs.doc.meta.docType}</div>
      <h2 className="doc-intro-title">{a.title}</h2>
      {rs.doc.meta.byline && <p className="muted small">{rs.doc.meta.byline}</p>}
      <p className="doc-intro-gist">{a.gist}</p>
      <p className="doc-intro-how muted">
        You’ll climb five layers, each a little deeper than the last. A quick check at the end of each one unlocks the next. Select any text to ask about it.
      </p>
    </section>
  );
}

function Preparing({ rs }: { rs: ReaderState }) {
  const { stage, stageDetail, error, doc } = rs;
  const steps = [
    { key: 'fetch', label: `Loaded ${doc.meta.words.toLocaleString()} words`, state: 'done' },
    ...(stage === 'digesting' || doc.digest ? [{ key: 'digest', label: stage === 'digesting' ? stageDetail ?? 'Reading a long document' : 'Condensed the long document', state: stage === 'digesting' ? 'active' : 'done' }] : []),
    { key: 'analyze', label: 'Mapping the key ideas', state: stage === 'analyzing' ? 'active' : stage === 'ready' ? 'done' : 'todo' },
    { key: 'layer', label: `Writing Layer 1 · ${layerDef(1).name}`, state: 'todo' },
  ];
  return (
    <div className="preparing">
      <div className="prep-mark"><SparkMark size={34} className={stage === 'error' ? '' : 'pulse'} /></div>
      <h1 className="layer-title">{doc.meta.title}</h1>
      {doc.meta.byline && <p className="muted">{doc.meta.byline}</p>}
      {stage === 'error' ? (
        <div className="callout callout-error">
          <p>{error}</p>
          {rs.models.length === 0 && <p className="muted">Spark Lens runs on GitHub Copilot. Install the GitHub Copilot Chat extension and sign in, then retry.</p>}
          <button className="btn btn-primary" onClick={() => post({ type: 'retryPrepare' })}>Retry</button>
        </div>
      ) : (
        <ol className="prep-steps">
          {steps.map((s) => (
            <li key={s.key} className={`prep-step ${s.state}`}>
              <span className="prep-icon">{s.state === 'done' ? <Check size={13} /> : s.state === 'active' ? <span className="spinner" /> : <Arrow size={12} />}</span>
              {s.label}
            </li>
          ))}
        </ol>
      )}
      <p className="muted small prep-note">Spark Lens uses your GitHub Copilot model, so no extra keys or accounts are needed.</p>
    </div>
  );
}

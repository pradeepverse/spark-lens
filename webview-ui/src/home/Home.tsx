import { useMemo, useState } from 'react';
import { LAYER_COUNT, ORIGINAL, layerDef } from '../../../src/shared/layers';
import type { HomeState } from '../../../src/shared/protocol';
import type { DocMeta, FeedItem } from '../../../src/shared/types';
import { ModelPicker, timeAgo, useNow } from '../common';
import { Arrow, Check, External, Flame, Globe, Medal, Paper, Pencil, Refresh, Seal, SparkMark, TextIcon, Trash } from '../icons';
import { post, useHost } from '../vscode';

const SUGGESTED = [
  'LLM agents',
  'Retrieval-augmented generation',
  'Distributed consensus',
  'Vector databases',
  'Stream processing',
  'Compilers',
  'Database indexing',
  'Zero-trust security',
  'Cryptography',
  'Edge computing',
  'Computer vision',
  'Recommender systems',
  'Observability',
  'Kubernetes scheduling',
  'Quantum computing',
  'Speech recognition',
];

function describeInput(v: string): { label: string; Icon: typeof Globe } | undefined {
  const s = v.trim();
  if (!s) return undefined;
  if (/^https?:\/\/\S+$/i.test(s)) {
    if (/arxiv\.org/i.test(s)) return { label: 'arXiv paper', Icon: Paper };
    if (/patents\.google\.com/i.test(s)) return { label: 'Google Patents page', Icon: Seal };
    if (/\.pdf($|\?)/i.test(s)) return { label: 'PDF link', Icon: Paper };
    return { label: `Web page · ${new URL(s).host}`, Icon: Globe };
  }
  const compact = s.toUpperCase().replace(/[\s,.\-/]/g, '');
  if (s.length < 40 && (/^(US|EP|WO|CN|JP|KR|DE|GB|FR|CA|AU|IN|TW)\d{5,}[A-Z]?\d?$/.test(compact) || /^\d{6,8}$/.test(compact))) {
    return { label: `Patent ${/^\d/.test(compact) ? `US${compact}` : compact}`, Icon: Seal };
  }
  const words = s.split(/\s+/).length;
  return { label: `Pasted text · ${words} words${words < 40 ? ' (paste a bit more)' : ''}`, Icon: TextIcon };
}

export function Home() {
  const [st, setSt] = useState<HomeState>();
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const now = useNow(60_000);

  useHost((m) => {
    if (m.type === 'home') setSt(m.state);
  });

  const hint = useMemo(() => describeInput(input), [input]);

  if (!st) return <div className="boot"><SparkMark size={24} className="pulse" /></div>;

  const submit = () => {
    if (!input.trim() || st.busy) return;
    post({ type: 'ingest', kind: 'auto', value: input.trim() });
    setInput('');
  };

  const showOnboarding = !st.profile.onboarded || editing;

  return (
    <div className="home">
      <header className="home-head">
        <div className="home-brand">
          <SparkMark size={20} className="brand-mark" />
          <div>
            <div className="home-title">Spark Lens</div>
            <div className="muted small">Read deep work, one layer at a time</div>
          </div>
        </div>
        <div className="home-stats">
          <span className={`pill ${st.profile.streak.count ? 'pill-hot' : ''}`} title={`Reading streak · best ${st.profile.streak.best} days`}>
            <Flame size={13} /> {st.profile.streak.count}
          </span>
          {st.profile.readyBadges > 0 && (
            <span className="pill" title="Documents where you passed every layer">
              <Medal size={13} /> {st.profile.readyBadges}
            </span>
          )}
        </div>
      </header>

      {st.copilotMissing && (
        <div className="callout callout-warn small">
          Spark Lens runs on <strong>GitHub Copilot</strong>. Install the GitHub Copilot Chat extension and sign in to start reading.
        </div>
      )}

      <section className="start card">
        <label className="section-label" htmlFor="spark-input">Start reading</label>
        <textarea
          id="spark-input"
          className="start-input"
          rows={input.length > 80 ? 5 : 2}
          placeholder="Paste a link, a patent number, or some text…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (!e.shiftKey && input.length < 300 && !input.includes('\n')))) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {hint && (
          <div className="start-hint">
            <hint.Icon size={13} /> {hint.label}
          </div>
        )}
        {st.busy ? (
          <div className="busy">
            <span className="busy-bar" />
            <span className="muted small">{st.busy}…</span>
          </div>
        ) : (
          <div className="start-actions">
            <button className="btn btn-primary" disabled={!input.trim()} onClick={submit}>
              <SparkMark size={13} /> Spark it
            </button>
            <button className="btn btn-ghost" onClick={() => post({ type: 'pickPdf' })}>
              <Paper size={13} /> Open PDF…
            </button>
          </div>
        )}
        {!input && !st.library.length && (
          <div className="try">
            <span className="muted small">Try:</span>
            <button className="link-btn small" onClick={() => setInput('https://arxiv.org/abs/1706.03762')}>Attention Is All You Need</button>
            <button className="link-btn small" onClick={() => setInput('https://arxiv.org/abs/2005.11401')}>RAG paper</button>
          </div>
        )}
      </section>

      {st.library.length > 0 && (
        <section className="home-section">
          <div className="section-row">
            <h2 className="section-label">Continue reading</h2>
            <span className="muted small">{st.library.length}</span>
          </div>
          <ul className="lib">
            {st.library.map((d) => <LibraryItem key={d.id} d={d} now={now} />)}
          </ul>
        </section>
      )}

      <section className="home-section">
        <div className="section-row">
          <h2 className="section-label">For you</h2>
          {!showOnboarding && (
            <div className="row-actions">
              <button className="icon-btn" title="Edit interests" onClick={() => setEditing(true)}><Pencil size={13} /></button>
              <button className={`icon-btn ${st.feedLoading ? 'spin' : ''}`} title="Refresh suggestions" onClick={() => post({ type: 'refreshFeed' })}><Refresh size={13} /></button>
            </div>
          )}
        </div>
        {showOnboarding ? (
          <Interests initial={st.profile.interests} onSave={(i) => { post({ type: 'setInterests', interests: i }); setEditing(false); }} onCancel={st.profile.onboarded ? () => setEditing(false) : undefined} />
        ) : (
          <Feed st={st} />
        )}
      </section>

      <footer className="home-foot">
        <ModelPicker models={st.models} modelId={st.modelId} onSelect={(id) => post({ type: 'selectModel', id })} />
        <p className="muted small">Uses your GitHub Copilot plan. Your library stays on this machine.</p>
      </footer>
    </div>
  );
}

function LibraryItem({ d, now }: { d: DocMeta; now: number }) {
  const p = d.progress;
  const where = p.readyAt ? 'Ready for the original' : p.current >= ORIGINAL ? 'Reading the original' : `Layer ${p.current} · ${layerDef(Math.min(p.current, LAYER_COUNT)).name}`;
  const Icon = d.kind === 'patent' || d.docType === 'patent' ? Seal : d.kind === 'text' ? TextIcon : Paper;
  return (
    <li className="lib-item" onClick={() => post({ type: 'openDoc', id: d.id })} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && post({ type: 'openDoc', id: d.id })}>
      <span className="lib-icon"><Icon size={15} /></span>
      <div className="lib-main">
        <div className="lib-title">{d.title}</div>
        <div className="lib-meta">
          <span className="dots" aria-label={`${p.passed.length} of ${LAYER_COUNT} layers passed`}>
            {Array.from({ length: LAYER_COUNT }, (_, i) => i + 1).map((n) => (
              <i key={n} className={p.passed.includes(n) ? 'on' : p.skipped.includes(n) ? 'half' : n === p.current ? 'cur' : ''} />
            ))}
            <i className={`book ${p.readyAt ? 'on' : p.current >= ORIGINAL ? 'cur' : ''}`} />
          </span>
          <span className="muted small">{where}</span>
        </div>
        <div className="muted xsmall">{timeAgo(d.openedAt, now)}</div>
      </div>
      {p.readyAt ? <span className="lib-done" title="All layers passed"><Check size={13} /></span> : null}
      <button
        className="icon-btn lib-del"
        title="Remove from library"
        onClick={(e) => {
          e.stopPropagation();
          post({ type: 'deleteDoc', id: d.id });
        }}
      >
        <Trash size={13} />
      </button>
    </li>
  );
}

function Interests({ initial, onSave, onCancel }: { initial: string[]; onSave: (i: string[]) => void; onCancel?: () => void }) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [custom, setCustom] = useState('');
  const all = [...new Set([...SUGGESTED, ...initial])];
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const addCustom = () => {
    const t = custom.trim();
    if (t && !picked.includes(t)) setPicked((p) => [...p, t]);
    setCustom('');
  };
  return (
    <div className="interests card">
      <p className="interests-q">What do you want to get sharper at?</p>
      <p className="muted small">Pick a few. Spark Lens suggests fresh papers and patents from these every day.</p>
      <div className="chips">
        {[...all, ...picked.filter((p) => !all.includes(p))].map((t) => (
          <button key={t} className={`chip chip-toggle ${picked.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)} aria-pressed={picked.includes(t)}>
            {picked.includes(t) && <Check size={11} />} {t}
          </button>
        ))}
      </div>
      <form className="custom-row" onSubmit={(e) => { e.preventDefault(); addCustom(); }}>
        <input className="input" placeholder="Add your own topic…" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn btn-ghost btn-sm" type="submit" disabled={!custom.trim()}>Add</button>
      </form>
      <div className="start-actions">
        <button className="btn btn-primary" disabled={!picked.length} onClick={() => onSave(picked)}>
          Show me what to read <Arrow size={13} />
        </button>
        {onCancel && <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

function Feed({ st }: { st: HomeState }) {
  const [filter, setFilter] = useState<string>();
  const feed = st.feed;
  const items = (feed?.items ?? []).filter((i) => !filter || i.interest === filter);
  return (
    <>
      <div className="chips chips-scroll">
        <button className={`chip chip-toggle ${!filter ? 'on' : ''}`} onClick={() => setFilter(undefined)}>All</button>
        {st.profile.interests.slice(0, 6).map((t) => (
          <button key={t} className={`chip chip-toggle ${filter === t ? 'on' : ''}`} onClick={() => setFilter(filter === t ? undefined : t)}>{t}</button>
        ))}
      </div>
      {st.feedLoading && !items.length && (
        <div className="feed-skeleton">
          {[0, 1, 2].map((i) => <div key={i} className="card skeleton-card"><span className="shimmer-line w60" /><span className="shimmer-line w90" /><span className="shimmer-line w75" /></div>)}
        </div>
      )}
      {feed?.error && !items.length && <div className="callout small">Couldn’t load suggestions: {feed.error}</div>}
      {!st.feedLoading && feed && !items.length && !feed.error && <p className="muted small">Nothing new for these topics. Try broader interests.</p>}
      <ul className="feed">
        {items.map((it) => <FeedCard key={it.id} it={it} busy={!!st.busy} />)}
      </ul>
    </>
  );
}

function FeedCard({ it, busy }: { it: FeedItem; busy: boolean }) {
  const Icon = it.kind === 'patent' ? Seal : Paper;
  return (
    <li className="feed-card card">
      <div className="feed-kind">
        <Icon size={12} /> {it.kind === 'patent' ? `Patent · ${it.id.replace('patent:', '')}` : 'Paper · arXiv'}
        {it.date && <span className="muted"> · {it.date}</span>}
      </div>
      <div className="feed-title">{it.title}</div>
      {it.byline && <div className="muted xsmall">{it.byline}</div>}
      <p className="feed-summary">{it.summary}</p>
      <div className="feed-actions">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => post({ type: 'ingest', kind: 'url', value: it.url })}>
          <SparkMark size={12} /> Spark it
        </button>
        <button className="icon-btn" title="Open in browser" onClick={() => post({ type: 'openExternal', url: it.url })}><External size={13} /></button>
        <span className="chip chip-sm feed-interest">{it.interest}</span>
      </div>
    </li>
  );
}

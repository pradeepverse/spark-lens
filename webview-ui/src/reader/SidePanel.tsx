import { useMemo, useState } from 'react';
import type { Analysis, DocMeta, SparkNote } from '../../../src/shared/types';
import { Bulb, Close, External, Question, SparkMark, Target, Trash } from '../icons';
import { Markdown, type MarkdownEnv, type TermDef } from './Markdown';

export type PanelTab = 'sparks' | 'glossary' | 'about';

interface Props {
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  notes: (SparkNote & { streaming?: boolean })[];
  onDeleteNote: (id: string) => void;
  terms: TermDef[];
  meta: DocMeta;
  analysis?: Analysis;
  env: MarkdownEnv;
  onOpenSource: () => void;
}

const ACTION_LABEL = {
  explain: { label: 'Simpler', Icon: SparkMark },
  analogy: { label: 'Analogy', Icon: Bulb },
  why: { label: 'Why it matters', Icon: Target },
  ask: { label: 'Question', Icon: Question },
};

export function SidePanel(p: Props) {
  const [filter, setFilter] = useState('');
  const terms = useMemo(
    () => p.terms.filter((t) => !filter || t.term.toLowerCase().includes(filter.toLowerCase()) || t.definition.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => a.term.localeCompare(b.term)),
    [p.terms, filter],
  );

  return (
    <aside className="side" aria-label="Reading companion">
      <div className="side-tabs" role="tablist">
        {(['sparks', 'glossary', 'about'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={p.tab === t} className={p.tab === t ? 'on' : ''} onClick={() => p.onTab(t)}>
            {t === 'sparks' ? `Sparks${p.notes.length ? ` · ${p.notes.length}` : ''}` : t === 'glossary' ? `Glossary${p.terms.length ? ` · ${p.terms.length}` : ''}` : 'About'}
          </button>
        ))}
        <div className="spacer" />
        <button className="icon-btn" onClick={p.onClose} title="Close panel"><Close size={14} /></button>
      </div>

      <div className="side-body">
        {p.tab === 'sparks' &&
          (p.notes.length === 0 ? (
            <div className="empty">
              <SparkMark size={26} className="empty-mark" />
              <p><strong>Select any sentence</strong> in a layer or the original to ask for a simpler explanation, an analogy, or why it matters.</p>
              <p className="muted">Your sparks are saved with this document.</p>
            </div>
          ) : (
            <ul className="notes">
              {p.notes.map((n) => {
                const { label, Icon } = ACTION_LABEL[n.action];
                return (
                  <li key={n.id} className={`note ${n.streaming ? 'is-streaming' : ''}`}>
                    <div className="note-head">
                      <span className="chip chip-sm"><Icon size={12} /> {label}</span>
                      <span className="muted note-layer">{n.layer <= 5 ? `Layer ${n.layer}` : 'Original'}</span>
                      <div className="spacer" />
                      {!n.streaming && (
                        <button className="icon-btn" title="Delete" onClick={() => p.onDeleteNote(n.id)}><Trash size={13} /></button>
                      )}
                    </div>
                    <blockquote className="note-quote">{n.selection.length > 220 ? `${n.selection.slice(0, 220)}…` : n.selection}</blockquote>
                    {n.question && <p className="note-question">{n.question}</p>}
                    <div className="note-answer prose prose-sm">
                      {n.answer ? <Markdown text={n.answer} env={{ ...p.env, streaming: n.streaming }} /> : <span className="typing"><i /><i /><i /></span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}

        {p.tab === 'glossary' && (
          <>
            <input className="input" placeholder="Filter terms…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {terms.length === 0 ? (
              <div className="empty"><p>Terms appear here as you climb the layers. Hover an underlined word while reading to see its meaning.</p></div>
            ) : (
              <dl className="glossary">
                {terms.map((t) => (
                  <div key={t.term} className="gl-item">
                    <dt>{t.term} <span className="chip chip-sm">L{t.layer}</span></dt>
                    <dd>{t.definition}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}

        {p.tab === 'about' && (
          <div className="about">
            <h3 className="about-title">{p.analysis?.title ?? p.meta.title}</h3>
            {p.meta.byline && <p className="muted">{p.meta.byline}</p>}
            <div className="about-chips">
              {p.analysis?.domain && <span className="chip">{p.analysis.domain}</span>}
              <span className="chip">{p.meta.docType}</span>
              <span className="chip">{p.meta.words.toLocaleString()} words</span>
              {p.analysis && <span className="chip" title="How hard the original is for an average developer">Difficulty {'●'.repeat(p.analysis.difficulty)}{'○'.repeat(5 - p.analysis.difficulty)}</span>}
            </div>
            {p.analysis?.gist && <p className="about-gist">{p.analysis.gist}</p>}
            {p.analysis?.whyItMatters && (
              <>
                <h4>Why it matters to you</h4>
                <p>{p.analysis.whyItMatters}</p>
              </>
            )}
            {!!p.analysis?.keyConcepts.length && (
              <>
                <h4>Key concepts</h4>
                <ol className="about-list">{p.analysis.keyConcepts.map((c) => <li key={c}>{c}</li>)}</ol>
              </>
            )}
            {!!p.analysis?.prerequisites.length && (
              <>
                <h4>Helpful background</h4>
                <ul className="about-list">{p.analysis.prerequisites.map((c) => <li key={c}>{c}</li>)}</ul>
              </>
            )}
            {p.meta.source.startsWith('http') && (
              <button className="btn btn-ghost" onClick={p.onOpenSource}><External size={14} /> Open source</button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

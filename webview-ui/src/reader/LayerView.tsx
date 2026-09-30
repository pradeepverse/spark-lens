import { LAYER_COUNT, layerDef } from '../../../src/shared/layers';
import type { LayerContent, Progress } from '../../../src/shared/types';
import { Arrow, Check, Stop, Wand } from '../icons';
import { Markdown, type MarkdownEnv } from './Markdown';
import { Quiz } from './Quiz';

interface Props {
  n: number;
  content?: LayerContent;
  streamingText?: string;
  generating: boolean;
  error?: string;
  progress: Progress;
  env: MarkdownEnv;
  onGenerate: (differently?: boolean) => void;
  onCancel: () => void;
  onQuiz: (correct: number, total: number, skipped: boolean) => void;
  onContinue: () => void;
}

const minutes = (text: string) => Math.max(1, Math.round((text.match(/\S+/g)?.length ?? 0) / 220));

export function LayerView({ n, content, streamingText, generating, error, progress, env, onGenerate, onCancel, onQuiz, onContinue }: Props) {
  const def = layerDef(n);
  const text = generating ? streamingText ?? '' : content?.markdown ?? '';
  const showBody = !!text;

  return (
    <article className={`layer layer-${n}`}>
      <header className="layer-head">
        <div className="eyebrow">
          Layer {n} of {LAYER_COUNT} · {def.audience}
        </div>
        <h1 className="layer-title">{def.name}</h1>
        <p className="layer-blurb">
          {def.blurb}
          {content && !generating && <span className="muted"> · {minutes(content.markdown)} min read</span>}
        </p>
        <div className="layer-rule" />
      </header>

      {!showBody && generating && (
        <div className="writing">
          <div className="shimmer-line w90" />
          <div className="shimmer-line w75" />
          <div className="shimmer-line w85" />
          <p className="muted">Spark is writing this layer for you…</p>
        </div>
      )}

      {error && !generating && (
        <div className="callout callout-error">
          <p>{error}</p>
          <button className="btn btn-primary btn-sm" onClick={() => onGenerate()}>Try again</button>
        </div>
      )}

      {!showBody && !generating && !error && (
        <div className="callout">
          <p>This layer hasn’t been written yet.</p>
          <button className="btn btn-primary" onClick={() => onGenerate()}>Write Layer {n}</button>
        </div>
      )}

      {showBody && (
        <div className={`prose ${generating ? 'is-streaming' : ''}`}>
          <Markdown text={text} env={{ ...env, streaming: generating }} />
          {generating && <span className="caret" aria-hidden />}
        </div>
      )}

      {generating && (
        <div className="gen-bar">
          <span className="typing"><i /><i /><i /></span>
          <span className="muted">Writing…</span>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}><Stop size={12} /> Stop</button>
        </div>
      )}

      {content && !generating && (
        <>
          {content.takeaways.length > 0 && (
            <section className="takeaways card">
              <h3>What you now know</h3>
              <ul>
                {content.takeaways.map((t, i) => (
                  <li key={i}><Check size={15} className="tk-check" /> {t}</li>
                ))}
              </ul>
            </section>
          )}

          <Quiz
            layer={n}
            quizKey={content.generatedAt}
            questions={content.quiz}
            passed={progress.passed.includes(n)}
            unlockedNext={progress.current > n}
            onResult={onQuiz}
            onContinue={onContinue}
            onDifferently={() => onGenerate(true)}
          />

          <footer className="layer-foot">
            <button className="btn btn-ghost btn-sm" onClick={() => onGenerate(true)} title="Rewrite this layer with a different angle and analogy">
              <Wand size={13} /> Explain this layer differently
            </button>
            {progress.current > n && (
              <button className="btn btn-ghost btn-sm" onClick={onContinue}>
                {n < LAYER_COUNT ? `Layer ${n + 1}` : 'The original'} <Arrow size={13} />
              </button>
            )}
            <div className="spacer" />
            <span className="muted small">Written by {content.model}</span>
          </footer>
        </>
      )}
    </article>
  );
}

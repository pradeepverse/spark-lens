import { useEffect, useState } from 'react';
import { LAYER_COUNT, PASS_RATIO, layerDef } from '../../../src/shared/layers';
import type { QuizQuestion } from '../../../src/shared/types';
import { Arrow, Check, Close, Target, Wand } from '../icons';

interface Props {
  layer: number;
  /** Changes only when the layer is regenerated. */
  quizKey: number;
  questions: QuizQuestion[];
  passed: boolean;
  unlockedNext: boolean;
  onResult: (correct: number, total: number, skipped: boolean) => void;
  onContinue: () => void;
  onDifferently: () => void;
}

const LETTERS = 'ABCDEF';

export function Quiz({ layer, quizKey, questions, passed, unlockedNext, onResult, onContinue, onDifferently }: Props) {
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [retaking, setRetaking] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    setAnswers([]);
    setReported(false);
    setRetaking(false);
  }, [layer, quizKey]);

  const nextName = layer < LAYER_COUNT ? `Layer ${layer + 1} · ${layerDef(layer + 1).name}` : 'The original';
  const done = answers.filter((a) => a !== undefined).length === questions.length && questions.length > 0;
  const correct = answers.reduce<number>((n, a, i) => n + (a === questions[i]?.answer ? 1 : 0), 0);
  const pass = done && correct / questions.length >= PASS_RATIO - 1e-9;

  useEffect(() => {
    if (done && !reported) {
      setReported(true);
      onResult(correct, questions.length, false);
    }
  }, [done, reported, correct, questions.length, onResult]);

  if (questions.length === 0) {
    return (
      <section className="quiz card">
        <p className="muted">No quiz came back for this layer.</p>
        <div className="quiz-actions">
          <button className="btn btn-primary" onClick={() => { onResult(0, 0, true); onContinue(); }}>
            Continue to {nextName} <Arrow />
          </button>
        </div>
      </section>
    );
  }

  if (passed && !retaking && !done) {
    return (
      <section className="quiz card quiz-passed">
        <div className="quiz-passed-row">
          <span className="badge-ok"><Check size={14} /></span>
          <div>
            <strong>You passed this check.</strong>
            <div className="muted">Retake it any time to refresh the ideas.</div>
          </div>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={() => setRetaking(true)}>Retake</button>
          <button className="btn btn-primary" onClick={onContinue}>
            {layer < LAYER_COUNT ? 'Next layer' : 'Read the original'} <Arrow />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="quiz card" aria-label="Quick check">
      <header className="quiz-head">
        <span className="quiz-icon"><Target size={18} /></span>
        <div>
          <h3>Quick check</h3>
          <p className="muted">Three questions. Get {Math.ceil(questions.length * PASS_RATIO)} right to unlock {nextName}.</p>
        </div>
        <div className="spacer" />
        {!done && !unlockedNext && (
          <button className="btn btn-ghost btn-sm" onClick={() => { onResult(0, questions.length, true); onContinue(); }} title="Unlock the next layer without the quiz (no badge credit)">
            Skip for now
          </button>
        )}
      </header>

      <ol className="quiz-list">
        {questions.map((q, qi) => {
          const chosen = answers[qi];
          const locked = chosen !== undefined;
          return (
            <li key={qi} className={`quiz-q ${locked ? (chosen === q.answer ? 'is-right' : 'is-wrong') : ''}`}>
              <p className="quiz-q-text">{q.q}</p>
              <div className="quiz-options" role="radiogroup">
                {q.options.map((opt, oi) => {
                  const state = !locked ? '' : oi === q.answer ? 'opt-right' : oi === chosen ? 'opt-wrong' : 'opt-dim';
                  return (
                    <button
                      key={oi}
                      role="radio"
                      aria-checked={chosen === oi}
                      disabled={locked}
                      className={`quiz-opt ${state}`}
                      onClick={() => setAnswers((a) => { const n = [...a]; n[qi] = oi; return n; })}
                    >
                      <span className="opt-letter">{LETTERS[oi]}</span>
                      <span className="opt-text">{opt}</span>
                      {locked && oi === q.answer && <Check size={16} className="opt-mark" />}
                      {locked && oi === chosen && oi !== q.answer && <Close size={16} className="opt-mark" />}
                    </button>
                  );
                })}
              </div>
              {locked && <p className="quiz-why"><strong>{chosen === q.answer ? 'Right.' : 'Not quite.'}</strong> {q.why}</p>}
            </li>
          );
        })}
      </ol>

      {done && (
        <footer className={`quiz-result ${pass ? 'pass' : 'fail'}`}>
          <div className="quiz-score">
            <span className="score-num">{correct}/{questions.length}</span>
            <span>{pass ? (layer < LAYER_COUNT ? `${nextName} unlocked` : 'All layers complete') : 'Almost there'}</span>
          </div>
          <div className="spacer" />
          {pass ? (
            <button className="btn btn-primary" onClick={onContinue}>
              {layer < LAYER_COUNT ? `Continue to Layer ${layer + 1}` : 'Read the original'} <Arrow />
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onDifferently}><Wand size={14} /> Explain differently</button>
              <button className="btn btn-ghost" onClick={() => { setAnswers([]); setReported(false); }}>Try again</button>
              <button className="btn btn-ghost" onClick={() => { onResult(correct, questions.length, true); onContinue(); }}>Skip for now</button>
            </>
          )}
        </footer>
      )}
    </section>
  );
}

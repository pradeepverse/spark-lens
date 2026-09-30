import { useEffect, useRef, useState } from 'react';
import type { AskAction } from '../../../src/shared/types';
import { Bulb, Question, SparkMark, Target } from '../icons';

interface Props {
  containerRef: React.RefObject<HTMLElement | null>;
  onAsk: (action: AskAction, selection: string, question?: string) => void;
}

interface Pos {
  x: number;
  y: number;
  text: string;
}

/** Floating actions shown over selected text: explain, analogy, why it matters, ask. */
export function SelectionToolbar({ containerRef, onAsk }: Props) {
  const [pos, setPos] = useState<Pos>();
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (asking) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      const container = containerRef.current;
      if (!sel || sel.rangeCount === 0 || text.length < 3 || !container || !container.contains(sel.anchorNode)) {
        setPos(undefined);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const host = container.getBoundingClientRect();
      setPos({
        x: Math.min(Math.max(rect.left + rect.width / 2 - host.left, 150), host.width - 150),
        y: rect.top - host.top + container.scrollTop,
        text: text.slice(0, 1500),
      });
    };
    const onUp = () => setTimeout(update, 0);
    const onDown = (e: MouseEvent) => {
      if (barRef.current?.contains(e.target as Node)) return;
      setAsking(false);
      setPos(undefined);
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keyup', onUp);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keyup', onUp);
      document.removeEventListener('mousedown', onDown);
    };
  }, [containerRef, asking]);

  if (!pos) return null;

  const fire = (action: AskAction, q?: string) => {
    onAsk(action, pos.text, q);
    setPos(undefined);
    setAsking(false);
    setQuestion('');
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div ref={barRef} className="sel-bar" style={{ left: pos.x, top: pos.y }} role="toolbar" aria-label="Ask Spark about the selection">
      {asking ? (
        <form
          className="sel-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) fire('ask', question.trim());
          }}
        >
          <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about this passage…" onKeyDown={(e) => e.key === 'Escape' && setAsking(false)} />
          <button className="btn btn-primary btn-sm" type="submit">Ask</button>
        </form>
      ) : (
        <>
          <button onClick={() => fire('explain')} title="Explain this more simply"><SparkMark size={14} /> Simpler</button>
          <button onClick={() => fire('analogy')} title="Give me an analogy"><Bulb size={14} /> Analogy</button>
          <button onClick={() => fire('why')} title="Why does this matter?"><Target size={14} /> Why it matters</button>
          <button onClick={() => setAsking(true)} title="Ask your own question"><Question size={14} /> Ask…</button>
        </>
      )}
    </div>
  );
}

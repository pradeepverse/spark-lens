import { LAYERS, ORIGINAL } from '../../../src/shared/layers';
import type { Profile, Progress } from '../../../src/shared/types';
import { Book, Check, Flame, Lock, Medal } from '../icons';

interface Props {
  progress: Progress;
  view: number;
  generating: Set<number>;
  profile: Profile;
  onSelect: (n: number) => void;
  burst?: number;
}

export function Ladder({ progress, view, generating, profile, onSelect, burst }: Props) {
  const rungs = [...LAYERS.map((l) => ({ n: l.n, name: l.name, audience: l.audience })), { n: ORIGINAL, name: 'The Original', audience: 'Read it with confidence' }];
  return (
    <nav className="ladder" aria-label="Layers">
      <div className="ladder-title">Your ladder</div>
      <ol>
        {rungs.map((r) => {
          const locked = r.n > progress.current;
          const passed = progress.passed.includes(r.n);
          const skipped = progress.skipped.includes(r.n);
          const state = locked ? 'locked' : passed ? 'passed' : skipped ? 'skipped' : r.n === progress.current ? 'current' : 'open';
          return (
            <li key={r.n}>
              <button
                className={`rung rung-${state} ${view === r.n ? 'is-active' : ''} ${burst === r.n ? 'burst' : ''}`}
                disabled={locked}
                onClick={() => onSelect(r.n)}
                aria-current={view === r.n ? 'step' : undefined}
                title={locked ? 'Pass the previous layer to unlock' : undefined}
              >
                <span className={`rung-dot l${r.n}`}>
                  {locked ? <Lock size={12} /> : passed ? <Check size={13} /> : r.n === ORIGINAL ? <Book size={12} /> : r.n}
                  {generating.has(r.n) && <span className="rung-spin" />}
                </span>
                <span className="rung-text">
                  <span className="rung-name">{r.name}</span>
                  <span className="rung-aud">{skipped ? 'Skipped quiz' : r.audience}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="ladder-stats">
        <div className="stat">
          <span className="stat-num">{progress.passed.length}<span className="muted">/{LAYERS.length}</span></span>
          <span className="stat-label">layers passed</span>
        </div>
        <div className="stat" title={`Best streak: ${profile.streak.best} days`}>
          <span className="stat-num flame"><Flame size={15} /> {profile.streak.count}</span>
          <span className="stat-label">day streak</span>
        </div>
        {progress.readyAt && (
          <div className="ready-badge" title="You passed every layer of this document">
            <Medal size={16} /> Ready to read
          </div>
        )}
      </div>
    </nav>
  );
}

import { createContext, memo, useContext, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { visit, SKIP } from 'unist-util-visit';
import type { Segment } from '../../../src/shared/types';
import { Mermaid } from './Mermaid';

export interface TermDef {
  term: string;
  definition: string;
  layer: number;
}

export interface MarkdownEnv {
  terms: Map<string, TermDef>;
  segments: Map<string, Segment>;
  onCite?: (segmentId: string) => void;
  streaming?: boolean;
}

const EnvContext = createContext<MarkdownEnv>({ terms: new Map(), segments: new Map() });

const MAX_MARKS_PER_TERM = 3;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Minimal hast shapes used by the plugin.
interface HText { type: 'text'; value: string }
interface HElement { type: 'element'; tagName: string; properties?: Record<string, unknown>; children: HNode[] }
type HNode = HText | HElement | { type: string; children?: HNode[] };

/**
 * Wraps glossary terms in <dfn> (hover definitions) and turns [s12] markers into
 * citation links to passages of the original. Skips code, math and links.
 */
function rehypeSpark(options: { terms: string[] }) {
  const sorted = [...options.terms].filter((t) => t.length > 1).sort((a, b) => b.length - a.length);
  const termRe = sorted.length ? new RegExp(`(?<![\\w-])(${sorted.map(escapeRe).join('|')})(?![\\w-])`, 'gi') : undefined;
  const lookup = new Map(sorted.map((t) => [t.toLowerCase(), t]));
  return (tree: HNode) => {
    const counts = new Map<string, number>();
    visit(tree as never, (node: HNode, index: number | undefined, parent: HElement | undefined) => {
      if (node.type === 'element') {
        const el = node as HElement;
        const cls = String((el.properties?.className as string[] | undefined)?.join(' ') ?? '');
        if (['code', 'pre', 'a', 'dfn', 'svg'].includes(el.tagName) || /katex|math/.test(cls)) return SKIP;
        return;
      }
      if (node.type !== 'text' || !parent || index === undefined) return;
      const value = (node as HText).value;
      const pieces: HNode[] = [];
      let last = 0;
      const re = new RegExp(
        `\\[(s\\d+)\\]${termRe ? `|${termRe.source}` : ''}`,
        'gi',
      );
      for (const m of value.matchAll(re)) {
        const at = m.index ?? 0;
        if (m[1]) {
          if (at > last) pieces.push({ type: 'text', value: value.slice(last, at) });
          pieces.push({ type: 'element', tagName: 'a', properties: { className: ['cite'], href: `#${m[1]}`, dataSeg: m[1] }, children: [{ type: 'text', value: m[1].slice(1) }] });
          last = at + m[0].length;
        } else if (m[2]) {
          const key = lookup.get(m[2].toLowerCase());
          if (!key) continue;
          const seen = counts.get(key) ?? 0;
          if (seen >= MAX_MARKS_PER_TERM) continue;
          counts.set(key, seen + 1);
          if (at > last) pieces.push({ type: 'text', value: value.slice(last, at) });
          pieces.push({ type: 'element', tagName: 'dfn', properties: { dataTerm: key }, children: [{ type: 'text', value: m[2] }] });
          last = at + m[0].length;
        }
      }
      if (!pieces.length) return;
      if (last < value.length) pieces.push({ type: 'text', value: value.slice(last) });
      parent.children.splice(index, 1, ...pieces);
      return index + pieces.length;
    });
  };
}

function Term({ children, ...props }: { children?: ReactNode; 'data-term'?: string }) {
  const env = useContext(EnvContext);
  const key = props['data-term'] ?? '';
  const def = env.terms.get(key.toLowerCase());
  const [open, setOpen] = useState(false);
  if (!def) return <>{children}</>;
  return (
    <dfn
      className="term"
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="term-pop" role="tooltip">
          <span className="term-pop-head">
            <strong>{def.term}</strong>
            <span className="chip chip-sm">Layer {def.layer}</span>
          </span>
          <span className="term-pop-body">{def.definition}</span>
        </span>
      )}
    </dfn>
  );
}

function Cite(props: { children?: ReactNode; 'data-seg'?: string; href?: string; className?: string }) {
  const env = useContext(EnvContext);
  const id = props['data-seg'] ?? '';
  const seg = env.segments.get(id);
  const [open, setOpen] = useState(false);
  return (
    <a
      className="cite"
      href={`#${id}`}
      onClick={(e) => {
        e.preventDefault();
        env.onCite?.(id);
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      title={env.onCite ? 'Jump to this passage in the original' : undefined}
    >
      §{props.children}
      {open && seg && (
        <span className="term-pop cite-pop" role="tooltip">
          <span className="term-pop-head">
            <strong>{seg.heading ?? 'Original passage'}</strong>
          </span>
          <span className="term-pop-body quote">{seg.text.slice(0, 360)}{seg.text.length > 360 ? '…' : ''}</span>
        </span>
      )}
    </a>
  );
}

const components: Components = {
  dfn: Term as Components['dfn'],
  a: (props) => {
    const p = props as unknown as { className?: string; href?: string; children?: ReactNode; 'data-seg'?: string };
    if (p.className?.includes('cite')) return <Cite {...p} />;
    return (
      <a href={p.href} title={p.href}>
        {p.children}
      </a>
    );
  },
  code: (props) => {
    const { className, children } = props as { className?: string; children?: ReactNode };
    const lang = /language-(\w+)/.exec(className ?? '')?.[1];
    if (lang === 'mermaid') return <MermaidBlock code={String(children ?? '')} />;
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }) => {
    const child = children as { props?: { className?: string } };
    if (child?.props?.className?.includes('language-mermaid')) return <>{children}</>;
    return <pre>{children}</pre>;
  },
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
};

function MermaidBlock({ code }: { code: string }) {
  const env = useContext(EnvContext);
  return <Mermaid code={code} streaming={!!env.streaming} />;
}

export const Markdown = memo(function Markdown({ text, env }: { text: string; env: MarkdownEnv }) {
  const termKeys = useMemo(() => [...env.terms.values()].map((t) => t.term), [env.terms]);
  const rehypePlugins = useMemo(() => [rehypeKatex, [rehypeSpark, { terms: termKeys }]] as never, [termKeys]);
  return (
    <EnvContext.Provider value={env}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </EnvContext.Provider>
  );
});

/** Plain-text renderer with the same glossary hovers, for passages of the original. */
export function RichText({ text, env }: { text: string; env: MarkdownEnv }) {
  const termKeys = useMemo(() => [...env.terms.values()].map((t) => t.term), [env.terms]);
  const plugins = useMemo(() => [[rehypeSpark, { terms: termKeys }]] as never, [termKeys]);
  // Escape markdown syntax so the original renders verbatim.
  const safe = text.replace(/([\\`*_{}[\]<>#|~])/g, '\\$1').replace(/^(\s*)(\d+)\./gm, '$1$2\\.').replace(/^(\s*)[-+]/gm, '$1\\-');
  return (
    <EnvContext.Provider value={env}>
      <ReactMarkdown rehypePlugins={plugins} components={components}>
        {safe}
      </ReactMarkdown>
    </EnvContext.Provider>
  );
}

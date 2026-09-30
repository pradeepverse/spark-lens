import { useEffect, useState } from 'react';

type MermaidApi = typeof import('mermaid')['default'];
let loader: Promise<MermaidApi> | undefined;
let seq = 0;

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

/** Mermaid is large, so it loads on first use and is themed from the VS Code colors. */
function loadMermaid(): Promise<MermaidApi> {
  loader ??= import('mermaid').then(({ default: mermaid }) => {
    const dark = document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: cssVar('--vscode-font-family', 'system-ui, sans-serif'),
      themeVariables: {
        darkMode: dark,
        background: 'transparent',
        primaryColor: dark ? '#3a2e1c' : '#fdf1dc',
        primaryBorderColor: dark ? '#f2b35b' : '#b86e00',
        primaryTextColor: cssVar('--vscode-foreground', dark ? '#eee' : '#222'),
        secondaryColor: dark ? '#26303d' : '#e8f0fb',
        tertiaryColor: dark ? '#2b2b2b' : '#f6f6f6',
        lineColor: cssVar('--vscode-descriptionForeground', '#888'),
        fontSize: '14px',
      },
      flowchart: { curve: 'basis', htmlLabels: true, padding: 12 },
    });
    return mermaid;
  });
  return loader;
}

export function Mermaid({ code, streaming }: { code: string; streaming: boolean }) {
  const [svg, setSvg] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // While streaming, wait for the block to settle before drawing.
    const t = setTimeout(
      async () => {
        try {
          const mermaid = await loadMermaid();
          const { svg } = await mermaid.render(`mmd-${++seq}`, code.trim());
          if (!cancelled) {
            setSvg(svg);
            setFailed(false);
          }
        } catch {
          document.querySelectorAll('[id^="dmmd-"]').forEach((n) => n.remove());
          if (!cancelled) setFailed(true);
        }
      },
      streaming ? 700 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, streaming]);

  if (svg && !(failed && !streaming)) {
    return <figure className="diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  if (failed && !streaming) {
    return (
      <figure className="diagram diagram-failed">
        <figcaption>This diagram couldn’t be drawn. Here is its outline:</figcaption>
        <pre>
          <code>{code}</code>
        </pre>
      </figure>
    );
  }
  return (
    <figure className="diagram diagram-pending">
      <span className="shimmer-line" />
      <figcaption>Sketching a diagram…</figcaption>
    </figure>
  );
}

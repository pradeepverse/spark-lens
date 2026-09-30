# Spark Lens

**Read research papers and patents with confidence, one layer at a time.**

Spark Lens turns a dense paper, patent or technical article into a ladder of five explanations, each a little deeper than the last. You start with a story a five-year-old would follow and finish with a section-by-section map of the original. A quick check at the end of each layer makes sure the idea landed before you climb higher. When you reach the top, the original opens with margin notes that point back to what you learned.

It runs on the **GitHub Copilot** plan you already have. There are no API keys and no extra accounts.

## The ladder

| Layer | Name | Written for |
| --- | --- | --- |
| 1 | The Story | Like you're 5: an everyday analogy, no jargon |
| 2 | The Picture | Like you're 10: the problem, the key idea, the first real terms |
| 3 | The Mechanism | A curious engineer: how it actually works, step by step |
| 4 | The Blueprint | A practitioner: precise design, trade-offs, prior art |
| 5 | The Source Map | An expert: how to read the original, claims decoded |
| ★ | The Original | The real document, annotated |

## What you can read

- **URLs**: arXiv, blogs, engineering articles, and direct PDF links. arXiv pages fetch the full paper automatically.
- **Patents**: type a number such as `US10133916B2` or `EP3456789A1`, or paste a Google Patents link.
- **PDFs**: pick a file, or right-click a `.pdf` in the Explorer and choose **Spark Lens: Read a PDF…**
- **Pasted text or a selection**: select text in any editor, right-click, and choose **Explain Selection Layer by Layer**.

## Features

- **Reading Room.** A calm reading view with serif type, adjustable text size, and light and dark themes.
- **Quick checks.** Three questions per layer. Two right answers unlock the next layer. You can skip, but only passing counts toward the *Ready to read* badge.
- **Living glossary.** Terms are underlined as they appear. Hover one to see a definition pitched at the layer you're on. Every term goes into your glossary.
- **Diagrams and math.** Architecture and flow diagrams (Mermaid) and equations (KaTeX) render inline.
- **Ask about a selection.** Select any sentence and choose *Simpler*, *Analogy*, *Why it matters* or *Ask…*. Answers are saved as Sparks next to the document.
- **Annotated original.** Margin notes mark key passages, decode tricky ones, flag what's safe to skim, and link each one back to the layer that explains it. Deeper layers cite passages like `§14`: hover one to preview the passage, click it to jump there.
- **For you.** Pick your interests and get fresh arXiv papers and patents every day.
- **@spark in Copilot Chat.** `@spark /explain <url>`, `/layer 2`, `/quiz`, `/glossary`, `/open`, or just ask a question about what you're reading.
- **Streaks and badges.** A daily reading streak and a badge for every document you fully climb.

## Requirements

- VS Code 1.95 or newer
- The **GitHub Copilot Chat** extension, signed in. The first time Spark Lens uses Copilot, VS Code asks you to allow it.

## Choosing a model

Use the model menu in the Reading Room or the Home view, or run **Spark Lens: Choose Copilot Model**. If you don't choose one, Spark Lens picks the first available model from `sparkLens.preferredModelFamilies`, falling back to the model with the largest context window. Each layer, quiz and glossary costs a single request. Long documents need a few extra requests once, to condense them.

## Privacy

Your library, progress, notes and glossary are stored only on your machine, in VS Code's extension storage. Document text goes to GitHub Copilot to produce explanations, under your Copilot plan's terms. Spark Lens fetches documents directly from the sites you point it at, and the suggestion feed queries arXiv and Google Patents.

## Settings

| Setting | Description |
| --- | --- |
| `sparkLens.model` | Id of the Copilot model to use. Leave empty for the default. |
| `sparkLens.preferredModelFamilies` | Model families tried in order when no model is chosen. |

## Troubleshooting

- **"No GitHub Copilot model is available"**: install GitHub Copilot Chat, sign in, then retry.
- **A patent lookup fails**: patent sites sometimes rate-limit automated requests. Wait a few minutes, or download the PDF from Google Patents and open it with **Open PDF…**
- **A PDF has no text**: scanned PDFs have no text layer. Use a text-based PDF or paste the text.

## Development

```bash
npm install
npm run build     # extension (esbuild) + webview (Vite)
npm test          # engine tests with a fake Copilot model
npm run package   # builds spark-lens-x.y.z.vsix
```

Press **F5** in VS Code to launch an Extension Development Host.

import * as vscode from 'vscode';
import type { SparkApp } from './app';
import { friendlyError } from './llm/request';
import { LAYER_COUNT, layerDef, ORIGINAL } from './shared/layers';
import type { LayerContent, SparkDoc } from './shared/types';
import { detect } from './sources';

interface SparkChatResult extends vscode.ChatResult {
  metadata?: { docId?: string; layer?: number; quiz?: boolean; next?: number };
}

const HELP = `**Spark Lens** turns dense papers and patents into a ladder of explanations, from *like you're 5* up to *expert*.

- \`@spark /explain <URL | patent number | pasted text>\` starts a document at Layer 1
- \`@spark /layer 2\` climbs to the next layer (unlock it with the quiz)
- \`@spark /quiz\` shows the current quiz; answer with \`@spark /quiz B D A\`
- \`@spark /glossary\` lists the terms you've learned
- \`@spark /open\` opens the full Reading Room
- Or ask \`@spark\` anything about the document you're reading.`;

export function registerChat(app: SparkApp): vscode.Disposable {
  const participant = vscode.chat.createChatParticipant('sparkLens.spark', (req, ctx, stream, token) =>
    handle(app, req, ctx, stream, token).catch((err) => {
      if (!(err instanceof vscode.CancellationError)) stream.markdown(`\n\n⚠️ ${friendlyError(err).message}`);
      return {};
    }),
  );
  participant.iconPath = vscode.Uri.joinPath(app.ctx.extensionUri, 'media', 'icon.png');
  participant.followupProvider = {
    provideFollowups(result: SparkChatResult) {
      const m = result.metadata;
      if (!m?.docId) return [];
      if (m.next) return [{ prompt: String(m.next), command: 'layer', label: `Read Layer ${m.next}` }];
      if (!m.layer) return [];
      if (m.quiz) return [];
      return [
        { prompt: '', command: 'quiz', label: `Check my understanding of Layer ${m.layer}` },
        { prompt: `${m.layer} differently`, command: 'layer', label: `Explain Layer ${m.layer} differently` },
      ];
    },
  };
  return participant;
}

async function activeDoc(app: SparkApp): Promise<SparkDoc | undefined> {
  const id = app.library.activeDocId ?? app.library.list()[0]?.id;
  return id ? app.library.load(id) : undefined;
}

async function handle(
  app: SparkApp,
  req: vscode.ChatRequest,
  _ctx: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<SparkChatResult> {
  const prompt = req.prompt.trim();
  const model = req.model;
  let command = req.command;
  if (!command && prompt && detect(prompt).kind !== 'text') command = 'explain';

  switch (command) {
    case 'explain': {
      if (!prompt) {
        stream.markdown('Give me something to read: a URL, a patent number (e.g. `US10133916B2`) or pasted text.\n\n' + HELP);
        return {};
      }
      stream.progress('Fetching the document…');
      const doc = await app.engine.ingest(detect(prompt));
      await app.engine.touch(doc);
      await app.engine.prepare(doc, model, token, (_s, detail) => detail && stream.progress(detail));
      stream.markdown(`## ${doc.meta.title}\n`);
      if (doc.analysis?.gist) stream.markdown(`> ${doc.analysis.gist}\n\n`);
      const n = Math.min(doc.meta.progress.current, LAYER_COUNT);
      await streamLayer(app, doc, n, model, stream, token);
      return { metadata: { docId: doc.meta.id, layer: n } };
    }

    case 'layer': {
      const doc = await activeDoc(app);
      if (!doc) return noDoc(stream);
      const p = doc.meta.progress;
      const n = Number.parseInt(prompt, 10) || Math.min(p.current, LAYER_COUNT);
      if (n < 1 || n > LAYER_COUNT) {
        stream.markdown(`Layers go from 1 to ${LAYER_COUNT}.`);
        return {};
      }
      if (n > p.current) {
        stream.markdown(`🔒 Layer ${n} unlocks after you pass the Layer ${p.current} quiz. Try \`@spark /quiz\`.`);
        return { metadata: { docId: doc.meta.id, layer: p.current } };
      }
      const regenerate = !!doc.layers[n] && /differently/i.test(prompt);
      await streamLayer(app, doc, n, model, stream, token, regenerate);
      return { metadata: { docId: doc.meta.id, layer: n } };
    }

    case 'quiz': {
      const doc = await activeDoc(app);
      if (!doc) return noDoc(stream);
      const n = Math.min(doc.meta.progress.current, LAYER_COUNT);
      const layer = doc.layers[n];
      if (!layer?.quiz.length) {
        stream.markdown(`There's no quiz for Layer ${n} yet. Read it first with \`@spark /layer ${n}\`.`);
        return {};
      }
      const answers = prompt.toUpperCase().match(/\b[A-F]\b/g);
      if (!answers) {
        stream.markdown(renderQuiz(layer));
        return { metadata: { docId: doc.meta.id, layer: n, quiz: true } };
      }
      return gradeQuiz(app, doc, layer, answers, stream);
    }

    case 'glossary': {
      const doc = await activeDoc(app);
      if (!doc) return noDoc(stream);
      const terms = Object.values(doc.layers).flatMap((l) => l.glossary);
      if (!terms.length) {
        stream.markdown('No terms yet. They appear as you climb the layers.');
        return {};
      }
      stream.markdown(`### Glossary · ${doc.meta.title}\n\n`);
      stream.markdown(terms.map((t) => `- **${t.term}** _(L${t.layer})_: ${t.definition}`).join('\n'));
      return {};
    }

    case 'open': {
      const doc = await activeDoc(app);
      if (!doc) return noDoc(stream);
      await app.openDoc(doc.meta.id);
      stream.markdown(`Opened **${doc.meta.title}** in the Reading Room.`);
      return {};
    }

    default: {
      if (!prompt) {
        stream.markdown(HELP);
        return {};
      }
      const doc = await activeDoc(app);
      if (doc) stream.markdown(`_About **${doc.meta.title}**, pitched at Layer ${Math.min(doc.meta.progress.current, LAYER_COUNT)}_\n\n`);
      let sent = 0;
      await app.engine.chatAnswer(doc, prompt, model, token, (t) => {
        stream.markdown(t.slice(sent));
        sent = t.length;
      });
      return { metadata: { docId: doc?.meta.id } };
    }
  }
}

async function streamLayer(
  app: SparkApp,
  doc: SparkDoc,
  n: number,
  model: vscode.LanguageModelChat,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  regenerate = false,
) {
  const def = layerDef(n);
  stream.markdown(`\n### Layer ${n} · ${def.name}  \n_${def.audience}_\n\n`);
  let layer = regenerate ? undefined : doc.layers[n];
  if (layer) {
    stream.markdown(layer.markdown);
  } else {
    // Hold back a short tail so a half-streamed meta delimiter never reaches the chat.
    let sent = 0;
    let last = '';
    const HOLD = 24;
    layer = await app.engine.generateLayer(
      doc,
      n,
      model,
      token,
      (body) => {
        last = body;
        const upTo = body.length - HOLD;
        if (upTo > sent) {
          stream.markdown(body.slice(sent, upTo));
          sent = upTo;
        }
      },
      regenerate,
    );
    stream.markdown(last.slice(sent));
  }
  if (layer.takeaways.length) {
    stream.markdown(`\n\n---\n**What you now know**\n${layer.takeaways.map((t) => `- ${t}`).join('\n')}\n`);
  }
  stream.button({ command: 'sparkLens.openDoc', arguments: [doc.meta.id], title: '$(book) Open in Reading Room' });
}

function renderQuiz(layer: LayerContent) {
  const letters = 'ABCDEF';
  const body = layer.quiz
    .map((q, i) => `**${i + 1}. ${q.q}**\n\n${q.options.map((o, j) => `- **${letters[j]}**. ${o}`).join('\n')}`)
    .join('\n\n');
  return `### Quick check · Layer ${layer.layer}\n\n${body}\n\nReply with your answers in order, e.g. \`@spark /quiz ${layer.quiz.map(() => 'B').join(' ')}\``;
}

async function gradeQuiz(app: SparkApp, doc: SparkDoc, layer: LayerContent, answers: string[], stream: vscode.ChatResponseStream): Promise<SparkChatResult> {
  const letters = 'ABCDEF';
  let correct = 0;
  const lines = layer.quiz.map((q, i) => {
    const given = letters.indexOf(answers[i] ?? '');
    const ok = given === q.answer;
    if (ok) correct++;
    return `${ok ? '✅' : '❌'} **${i + 1}.** ${ok ? '' : `Answer: **${letters[q.answer]}**. `}${q.why}`;
  });
  const r = await app.engine.recordQuiz(doc, layer.layer, correct, layer.quiz.length, false);
  stream.markdown(`### ${correct}/${layer.quiz.length} correct\n\n${lines.join('\n\n')}\n\n`);
  if (r.becameReady) {
    stream.markdown('🏅 **You passed all five layers.** You are ready to read the original. Open the Reading Room for a guided, annotated reading.');
    stream.button({ command: 'sparkLens.openDoc', arguments: [doc.meta.id], title: '$(book) Read the original' });
  } else if (r.passed && layer.layer < LAYER_COUNT) {
    stream.markdown(`✨ Layer ${layer.layer + 1} unlocked. Continue with \`@spark /layer ${layer.layer + 1}\`.`);
  } else if (!r.passed) {
    stream.markdown(`Not quite there yet. Re-read Layer ${layer.layer} or ask \`@spark\` about the parts that felt fuzzy, then try again.`);
  }
  const next = doc.meta.progress.current;
  return { metadata: { docId: doc.meta.id, quiz: !r.passed, next: r.passed && next < ORIGINAL ? next : undefined } };
}

function noDoc(stream: vscode.ChatResponseStream): SparkChatResult {
  stream.markdown(`You haven't opened a document yet.\n\n${HELP}`);
  return {};
}

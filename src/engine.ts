import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { Library } from './library';
import { analysisPrompt, askPrompt, chatAnswerPrompt, digestPrompt, guidePrompt, layerPrompt } from './llm/prompts';
import { approxTokens, parseJson, splitMeta, streamText } from './llm/request';
import { LAYER_COUNT, ORIGINAL, PASS_RATIO } from './shared/layers';
import type { Stage } from './shared/protocol';
import type { Analysis, Annotation, AskAction, GlossaryEntry, LayerContent, QuizQuestion, SparkDoc, SparkNote } from './shared/types';
import { Detected, loadSource } from './sources';
import { countWords } from './sources/segment';

const PROMPT_OVERHEAD_TOKENS = 5000;
const MAX_CONTEXT_TOKENS = 120_000;

export class SparkEngine {
  constructor(private readonly library: Library) {}

  /** Loads a source into the library, reusing an existing entry for the same URL, file or patent. */
  async ingest(d: Detected): Promise<SparkDoc> {
    const loaded = await loadSource(d);
    const existing = this.library.findBySource(loaded.source);
    if (existing) {
      const doc = await this.library.load(existing.id);
      if (doc) return this.touch(doc);
    }
    if (loaded.segments.length === 0) throw new Error('No readable text was found in that source.');
    const now = Date.now();
    const doc: SparkDoc = {
      meta: {
        id: randomUUID().slice(0, 12),
        title: loaded.title,
        kind: loaded.kind,
        docType: loaded.docType,
        source: loaded.source,
        byline: loaded.byline,
        addedAt: now,
        openedAt: now,
        words: loaded.segments.reduce((n, s) => n + countWords(s.text), 0),
        progress: { current: 1, passed: [], skipped: [] },
      },
      segments: loaded.segments,
      layers: {},
      notes: [],
    };
    await this.library.save(doc);
    return doc;
  }

  async touch(doc: SparkDoc) {
    doc.meta.openedAt = Date.now();
    await this.library.save(doc);
    await this.library.setActive(doc.meta.id);
    return doc;
  }

  fullText(doc: SparkDoc) {
    let lastHeading: string | undefined;
    return doc.segments
      .map((s) => {
        const h = s.heading && s.heading !== lastHeading ? `\n## ${s.heading}\n` : '';
        lastHeading = s.heading ?? lastHeading;
        return `${h}[${s.id}] ${s.text}`;
      })
      .join('\n');
  }

  private budget(model: vscode.LanguageModelChat, share = 1) {
    const max = Math.min(model.maxInputTokens || 64_000, MAX_CONTEXT_TOKENS);
    return Math.max(4000, Math.floor((max - PROMPT_OVERHEAD_TOKENS) * 0.85 * share));
  }

  /** The best document context that fits the model: the full text, else the digest. */
  context(doc: SparkDoc, model: vscode.LanguageModelChat, share = 1) {
    const budget = this.budget(model, share);
    const full = this.fullText(doc);
    if (approxTokens(full) <= budget) return full;
    const src = doc.digest ?? full;
    return approxTokens(src) <= budget ? src : `${src.slice(0, budget * 4)}\n[…truncated]`;
  }

  /** Condenses long documents and builds the document profile. Each step is cached on the doc. */
  async prepare(doc: SparkDoc, model: vscode.LanguageModelChat, token: vscode.CancellationToken, onStage: (s: Stage, detail?: string) => void) {
    const budget = this.budget(model);
    const full = this.fullText(doc);
    if (!doc.digest && approxTokens(full) > budget) {
      const chunkChars = Math.min(budget * 0.8, 30_000) * 4;
      const chunks = splitChunks(full, chunkChars);
      const wordsEach = Math.min(1500, Math.floor((budget * 0.6 * 0.75) / chunks.length));
      const notes: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        onStage('digesting', `Reading part ${i + 1} of ${chunks.length}`);
        notes.push(await streamText(model, digestPrompt(chunks[i], i + 1, chunks.length, wordsEach), token));
      }
      doc.digest = notes.map((n, i) => `### Part ${i + 1}\n${n.trim()}`).join('\n\n');
      await this.library.save(doc);
    }
    if (!doc.analysis) {
      onStage('analyzing', 'Mapping the key ideas');
      const raw = await streamText(model, analysisPrompt(this.context(doc, model), doc.meta.title), token);
      const a = parseJson<Partial<Analysis>>(raw);
      if (!a) throw new Error('Copilot returned an unexpected response while analyzing the document. Please retry.');
      doc.analysis = {
        title: a.title?.trim() || doc.meta.title,
        docType: a.docType ?? doc.meta.docType,
        gist: a.gist ?? '',
        domain: a.domain ?? '',
        difficulty: clamp(Number(a.difficulty) || 3, 1, 5),
        whyItMatters: a.whyItMatters ?? '',
        keyConcepts: a.keyConcepts ?? [],
        prerequisites: a.prerequisites ?? [],
        outline: a.outline ?? [],
      };
      if (doc.meta.kind !== 'patent') doc.meta.title = doc.analysis.title;
      doc.meta.docType = doc.meta.kind === 'patent' ? 'patent' : doc.analysis.docType;
      doc.meta.gist = doc.analysis.gist;
      doc.meta.domain = doc.analysis.domain;
      doc.meta.difficulty = doc.analysis.difficulty;
      await this.library.save(doc);
    }
    onStage('ready');
    return doc;
  }

  async generateLayer(
    doc: SparkDoc,
    n: number,
    model: vscode.LanguageModelChat,
    token: vscode.CancellationToken,
    onBody: (body: string) => void,
    differently = false,
  ): Promise<LayerContent> {
    const previous = differently ? doc.layers[n]?.markdown.slice(0, 500) : undefined;
    const prompt = layerPrompt(doc, n, this.context(doc, model), previous);
    const full = await streamText(model, prompt, token, (text) => onBody(splitMeta(text).body));
    const { body, meta } = splitMeta(full);
    const parsed = meta ? parseJson<{ takeaways?: string[]; glossary?: GlossaryEntry[]; quiz?: QuizQuestion[] }>(meta) : undefined;
    const content: LayerContent = {
      layer: n,
      markdown: body.trim(),
      takeaways: (parsed?.takeaways ?? []).filter((t) => typeof t === 'string').slice(0, 6),
      glossary: (parsed?.glossary ?? [])
        .filter((g) => g && typeof g.term === 'string' && typeof g.definition === 'string')
        .map((g) => ({ term: g.term.trim(), definition: g.definition.trim(), layer: n })),
      quiz: (parsed?.quiz ?? []).filter(validQuestion).map(shuffleOptions),
      model: model.name,
      generatedAt: Date.now(),
    };
    doc.layers[n] = content;
    await this.library.save(doc);
    await this.library.addToGlossary(doc, content);
    return content;
  }

  /** Records a quiz outcome and unlocks the next layer. Returns whether the reader just became "ready". */
  async recordQuiz(doc: SparkDoc, n: number, correct: number, total: number, skipped: boolean) {
    const p = doc.meta.progress;
    const passed = !skipped && total > 0 && correct / total >= PASS_RATIO - 1e-9;
    if (passed) {
      p.passed = [...new Set([...p.passed, n])];
      p.skipped = p.skipped.filter((x) => x !== n);
      await this.library.touchStreak();
    } else if (skipped && !p.passed.includes(n)) {
      p.skipped = [...new Set([...p.skipped, n])];
    }
    const unlocked = passed || skipped;
    if (unlocked) p.current = Math.max(p.current, Math.min(n + 1, ORIGINAL));
    let becameReady = false;
    if (!p.readyAt && p.passed.length >= LAYER_COUNT) {
      p.readyAt = Date.now();
      becameReady = true;
      const profile = this.library.profile();
      await this.library.updateProfile({ readyBadges: profile.readyBadges + 1 });
    }
    await this.library.save(doc);
    return { passed, unlocked, becameReady };
  }

  async ask(
    doc: SparkDoc,
    action: AskAction,
    selection: string,
    layerN: number,
    question: string | undefined,
    model: vscode.LanguageModelChat,
    token: vscode.CancellationToken,
    onStart: (note: SparkNote) => void,
    onText: (id: string, text: string) => void,
  ): Promise<SparkNote> {
    const note: SparkNote = { id: randomUUID().slice(0, 8), action, selection, question, answer: '', layer: layerN, createdAt: Date.now() };
    onStart(note);
    const prompt = askPrompt(doc, action, selection, doc.layers[layerN], this.context(doc, model, 0.5), question);
    note.answer = (await streamText(model, prompt, token, (t) => onText(note.id, t))).trim();
    doc.notes.unshift(note);
    await this.library.save(doc);
    return note;
  }

  async deleteNote(doc: SparkDoc, id: string) {
    doc.notes = doc.notes.filter((n) => n.id !== id);
    await this.library.save(doc);
  }

  async guide(doc: SparkDoc, model: vscode.LanguageModelChat, token: vscode.CancellationToken): Promise<Annotation[]> {
    // Shorten each segment's preview so the whole listing fits the model.
    const budgetChars = this.budget(model, 0.7) * 4;
    const per = Math.max(80, Math.min(280, Math.floor(budgetChars / Math.max(1, doc.segments.length)) - 20));
    const segments = doc.segments.map((s) => ({ ...s, text: s.text.slice(0, per) }));
    const raw = await streamText(model, guidePrompt(doc, segments), token);
    const ids = new Set(doc.segments.map((s) => s.id));
    const parsed = parseJson<Annotation[]>(raw) ?? [];
    const annotations = (Array.isArray(parsed) ? parsed : [])
      .filter((a) => a && ids.has(a.segmentId) && typeof a.note === 'string')
      .map((a) => ({
        segmentId: a.segmentId,
        kind: (['key', 'tricky', 'skim', 'claim'] as const).includes(a.kind) ? a.kind : 'key',
        note: a.note.trim(),
        layer: clamp(Number(a.layer) || 3, 1, LAYER_COUNT),
      }));
    if (annotations.length === 0) throw new Error('Copilot could not produce a reading guide this time. Please retry.');
    doc.annotations = annotations;
    await this.library.save(doc);
    return annotations;
  }

  async chatAnswer(doc: SparkDoc | undefined, question: string, model: vscode.LanguageModelChat, token: vscode.CancellationToken, onText: (t: string) => void) {
    const layerN = doc ? Math.min(doc.meta.progress.current, LAYER_COUNT) : 1;
    const context = doc ? this.context(doc, model, 0.6) : '';
    return streamText(model, chatAnswerPrompt(doc, question, layerN, context), token, onText);
  }
}

function splitChunks(text: string, size: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + size);
    if (end < text.length) {
      const br = text.lastIndexOf('\n', end);
      if (br > i + size * 0.6) end = br;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

function validQuestion(q: QuizQuestion) {
  return (
    q &&
    typeof q.q === 'string' &&
    Array.isArray(q.options) &&
    q.options.length >= 2 &&
    q.options.length <= 6 &&
    Number.isInteger(q.answer) &&
    q.answer >= 0 &&
    q.answer < q.options.length
  );
}

/** Shuffles options so the correct answer's position is truly random. */
function shuffleOptions(q: QuizQuestion): QuizQuestion {
  const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
  return { ...q, options: order.map((i) => String(q.options[i])), answer: order.indexOf(q.answer), why: String(q.why ?? '') };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Runs the engine against a fake Copilot model: `npm test`.
import assert from 'node:assert/strict';
import { SparkEngine } from '../src/engine';
import { Library } from '../src/library';
import { parseJson, splitMeta, META_DELIMITER } from '../src/llm/request';
import { segmentPlainText } from '../src/sources/segment';
import { normalizePatentNumber } from '../src/sources/patent';
import { detect } from '../src/sources';

const state = new Map<string, unknown>();
const ctx = {
  globalState: { get: (k: string, d?: unknown) => (state.has(k) ? state.get(k) : d), update: async (k: string, v: unknown) => void state.set(k, v) },
  globalStorageUri: { path: '/mem' },
} as never;

/** A fake model whose replies are chosen by what the prompt asks for. */
function fakeModel(maxInputTokens = 100_000) {
  const prompts: string[] = [];
  return {
    prompts,
    model: {
      id: 'fake', name: 'Fake Model', family: 'fake', vendor: 'copilot', version: '1', maxInputTokens,
      countTokens: async () => 1,
      sendRequest: async (messages: { content: string }[]) => {
        const prompt = messages[0].content;
        prompts.push(prompt);
        let reply: string;
        if (prompt.includes('dense technical notes')) reply = '- note about part';
        else if (prompt.includes('return a profile')) reply = '```json\n{"title":"Real Title","docType":"paper","gist":"g","domain":"d","difficulty":9,"whyItMatters":"w","keyConcepts":["a"],"prerequisites":[],"outline":[],}\n```';
        else if (prompt.includes('margin annotations')) reply = '[{"segmentId":"s1","kind":"key","note":"n","layer":2},{"segmentId":"s999","kind":"key","note":"bad id","layer":1}]';
        else reply = `Once upon a time **encoder** things.\n\n${META_DELIMITER}\n{"takeaways":["t1","t2"],"glossary":[{"term":"encoder","definition":"reads"}],"quiz":[{"q":"Q1","options":["a","b","c","d"],"answer":2,"why":"y"},{"q":"bad","options":["a"],"answer":5,"why":""}]}`;
        async function* text() {
          for (let i = 0; i < reply.length; i += 7) yield reply.slice(i, i + 7);
        }
        return { text: text(), stream: text() };
      },
    } as never,
  };
}

const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never;

async function main() {
  // Pure helpers
  assert.equal(splitMeta(`body\n${META_DELIMITER}\n{}`).body, 'body');
  assert.equal(splitMeta('body text ==').body, 'body text ==', 'short "==" is not a delimiter start');
  assert.equal(splitMeta('body text\n===SPARK').body, 'body text', 'partial delimiter is hidden while streaming');
  assert.deepEqual(parseJson('sure! ```json\n{"a":[1,2,],}\n``` done'), { a: [1, 2] });
  assert.equal(parseJson('no json here'), undefined);
  assert.equal(normalizePatentNumber('US 10,133,916 B2'), 'US10133916B2');
  assert.equal(normalizePatentNumber('10133916'), 'US10133916');
  assert.equal(normalizePatentNumber('hello'), undefined);
  assert.equal(detect('https://arxiv.org/abs/1706.03762').kind, 'url');
  assert.equal(detect('EP3456789A1').kind, 'patent');
  const lines = Array.from({ length: 200 }, (_, i) => `This is line ${i} of the introduction, and it ends here.`).join('\n');
  const segs = segmentPlainText(`1 Introduction\n${lines}\n\nReferences\n[1] Foo et al. 2020.`);
  assert.ok(segs.length > 10, 'long text is split into segments');
  assert.ok(segs.every((s) => s.heading === '1 Introduction'), 'headings are detected and references are dropped');
  assert.equal(segmentPlainText('exam-\nple text').at(0)?.text, 'example text', 'line-break hyphens are joined');

  // Engine flow
  const lib = new Library(ctx);
  const engine = new SparkEngine(lib);
  const text = Array.from({ length: 80 }, (_, i) => `Paragraph ${i} about encoders and decoders. `.repeat(12)).join('\n\n');
  const doc = await engine.ingest({ kind: 'text', value: text });
  assert.ok(doc.segments.length > 3);

  const small = fakeModel(6000); // forces the digest path
  const stages: string[] = [];
  await engine.prepare(doc, small.model, token, (s) => stages.push(s));
  assert.ok(stages.includes('digesting'), 'long docs are digested');
  assert.ok(doc.digest?.includes('note about part'));
  assert.equal(doc.analysis?.title, 'Real Title');
  assert.equal(doc.analysis?.difficulty, 5, 'difficulty is clamped');

  const fm = fakeModel();
  const bodies: string[] = [];
  const layer = await engine.generateLayer(doc, 1, fm.model, token, (b) => bodies.push(b));
  assert.ok(!bodies.some((b) => b.includes('===')), 'delimiter never streams to the UI');
  assert.equal(layer.markdown, 'Once upon a time **encoder** things.');
  assert.equal(layer.quiz.length, 1, 'invalid quiz questions are dropped');
  assert.equal(layer.quiz[0].options[layer.quiz[0].answer], 'c', 'shuffle keeps the right answer');
  assert.equal(lib.glossary().length, 1);

  let r = await engine.recordQuiz(doc, 1, 0, 1, false);
  assert.equal(r.unlocked, false);
  assert.equal(doc.meta.progress.current, 1);
  r = await engine.recordQuiz(doc, 1, 1, 1, false);
  assert.ok(r.passed && doc.meta.progress.current === 2);
  for (const n of [2, 3, 4]) await engine.recordQuiz(doc, n, 3, 3, false);
  r = await engine.recordQuiz(doc, 5, 2, 3, false);
  assert.ok(r.becameReady && doc.meta.progress.current === 6, 'passing all five layers unlocks the original');
  assert.equal(lib.profile().readyBadges, 1);
  assert.equal(lib.profile().streak.count, 1);

  await engine.generateLayer(doc, 4, fm.model, token, () => undefined);
  assert.ok(fm.prompts.at(-1)!.includes('Layer 1 (The Story):\n- t1'), 'later layers build on earlier takeaways');

  const notes = await engine.guide(doc, fm.model, token);
  assert.deepEqual(notes.map((n) => n.segmentId), ['s1'], 'unknown segment ids are dropped');

  console.log('✓ all engine tests passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

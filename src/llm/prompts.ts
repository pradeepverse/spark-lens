import { LAYERS, layerDef } from '../shared/layers';
import type { AskAction, DocType, LayerContent, Segment, SparkDoc } from '../shared/types';
import { META_DELIMITER } from './request';

const PERSONA = `You are Spark Lens, a world-class teacher who helps software developers understand research papers, patents and technical articles. You explain with warmth, clarity and precision. Stay faithful to the document: never invent results, numbers or claims it does not support, and say so plainly when the document is vague.`;

const kindLabel = (t: DocType) =>
  t === 'patent' ? 'patent' : t === 'paper' ? 'research paper' : t === 'article' ? 'technical article' : 'technical text';

export function digestPrompt(part: string, index: number, total: number, words: number) {
  return `${PERSONA}

Below is part ${index} of ${total} of a long document. Write dense technical notes on it so that someone who never sees the original can still explain it precisely.

Rules:
- Keep the original section headings, claim numbers, figure and table numbers as markers.
- Preserve every mechanism, named component, definition, equation, number, dataset, result and claim element.
- Use terse bullet points. No introduction, no conclusion.
- Maximum about ${words} words.

PART ${index}/${total}
<<<
${part}
>>>`;
}

export function analysisPrompt(context: string, title: string) {
  return `${PERSONA}

Study this document and return a profile of it as JSON.

Working title: ${title}

DOCUMENT
<<<
${context}
>>>

Return ONLY a JSON object with these fields:
{
  "title": "the document's real title",
  "docType": "patent" | "paper" | "article" | "text",
  "gist": "one sentence in plain English that a non-specialist understands",
  "domain": "the field, 2-4 words",
  "difficulty": 1-5 (how hard the original is for an average software developer),
  "whyItMatters": "1-2 sentences on why a working developer should care",
  "keyConcepts": ["5-8 core concepts the reader must understand, most fundamental first"],
  "prerequisites": ["3-6 background ideas that help, in plain words"],
  "outline": ["the original's main sections or claim groups, in order"]
}`;
}

const LAYER_GUIDE: Record<number, (t: DocType) => string> = {
  1: () => `Explain the core idea as a short story or everyday analogy that a 5-year-old could follow (toys, kitchens, playgrounds, post offices, games).
- Absolutely no jargon, acronyms or technical words.
- Show the problem first ("there was a problem..."), then how the idea solves it.
- Warm, vivid, concrete. Short sentences.
- End with a line in bold: **The big idea:** followed by one sentence.
- No diagram, no math, no headings.`,
  2: () => `Explain like you would to a bright, curious 10-year-old.
- Reuse the story from Layer 1 as a bridge, then connect it to the real thing.
- Cover: what problem exists, why it is hard, what the key idea is, and the big steps of how it works.
- Introduce 3-5 real technical terms gently. Each new term is **bold** the first time, with its plain meaning in the same sentence.
- Include one simple mermaid flowchart of the big steps (at most 6 nodes).
- Use 2-3 short ## headings.`,
  3: () => `Explain to a curious software engineer who is smart but not a specialist in this field.
- Name the earlier analogy once as a bridge, then leave it behind.
- Describe how it actually works: the components, their inputs and outputs, and the step-by-step flow.
- Explain why this approach beats the obvious or naive approach. Contrast them explicitly.
- Use a short pseudocode block if it makes the flow clearer.
- Include one mermaid diagram of the architecture or data flow (flowchart or sequenceDiagram, at most 10 nodes).
- Use ## headings for each part.`,
  4: (t) => `Explain to a practitioner working in this field.
- Use precise terminology. Assume the reader now knows the basics from earlier layers.
- Cover: the ${t === 'patent' ? 'system and method' : 'architecture and algorithm'} in detail; key design decisions and their trade-offs; assumptions; limitations and failure modes; how it relates to prior art and well-known techniques; where it would fit in real production systems.
- Include equations (KaTeX, $...$ inline or $$...$$ display) only where they are central.
- Include a mermaid diagram only if it adds precision beyond Layer 3.
- Use ## headings. A comparison table is welcome where it helps.`,
  5: (t) =>
    t === 'patent'
      ? `Prepare the reader to read the ORIGINAL patent with confidence. Use these ## sections:
1. **How this patent is organized**: a map of its sections and what to get from each.
2. **The claims, decoded**: for each independent claim, a plain-English rewrite and a bullet breakdown of its elements. Note which elements look novel. Mention how the dependent claims narrow them.
3. **Vocabulary bridge**: a table mapping the patent's legal phrasing to plain engineering terms.
4. **Read it in this order**: a suggested reading path, including what to skim.
5. **Watch out for**: likely points of confusion and how to resolve them.
Refer to the original's own section names, claim numbers and figure numbers.`
      : `Prepare the reader to read the ORIGINAL ${kindLabel(t)} with confidence. Use these ## sections:
1. **How it is organized**: a section-by-section map and what to get from each.
2. **The load-bearing parts**: the key equations, figures, tables or algorithms. For each: what it shows and how to read it.
3. **Vocabulary bridge**: a table mapping the document's terms and notation to plain engineering terms.
4. **Read it in this order**: a suggested reading path, including what to skim.
5. **Questions to hold while reading**: 4-6 questions that keep the reader critical.
6. **Watch out for**: likely points of confusion and how to resolve them.
Refer to the original's own section names, equation, figure and table numbers.`,
};

export function layerPrompt(doc: SparkDoc, n: number, context: string, differently?: string) {
  const def = layerDef(n);
  const a = doc.analysis;
  const t = a?.docType ?? doc.meta.docType;
  const earlier = LAYERS.filter((l) => l.n < n && doc.layers[l.n])
    .map((l) => `Layer ${l.n} (${l.name}):\n${doc.layers[l.n].takeaways.map((x) => `- ${x}`).join('\n')}`)
    .join('\n');
  const glossaryCount = n === 1 ? '0-2' : n === 2 ? '3-5' : '4-8';

  return `${PERSONA}

DOCUMENT PROFILE
Title: ${a?.title ?? doc.meta.title}
Type: ${kindLabel(t)}
${a ? `Gist: ${a.gist}\nDomain: ${a.domain}\nKey concepts: ${a.keyConcepts.join('; ')}` : ''}

${earlier ? `WHAT THE READER ALREADY UNDERSTANDS (from earlier layers; build on it, do not repeat it)\n${earlier}\n` : ''}
DOCUMENT ${doc.digest ? 'NOTES (condensed from the full text)' : 'CONTENT'}
<<<
${context}
>>>

TASK
Write Layer ${n} of ${LAYERS.length}: "${def.name}" for this audience: ${def.audience}.
${LAYER_GUIDE[n](t)}
${differently ? `\nThe reader found the previous version of this layer unclear. Take a completely different angle and use a different analogy. The previous version started like this, so avoid it:\n"""${differently}"""\n` : ''}
FORMAT
- GitHub-flavored Markdown. Start directly with the content: no top-level title and no preamble like "Sure".
- Mermaid: use "flowchart TD" (top-down) when there are more than 4 nodes, "flowchart LR" otherwise. Put labels in double quotes, e.g. A["Client"] --> B["Cache"]. Keep labels under 5 words. No styling directives.
- Target length: about ${def.words} words.${n >= 4 ? `\n- When you point to a specific passage of the original, cite its marker exactly like [s12] (markers appear in the document content).` : '\n- Do not mention the [sNN] passage markers.'}
- After the markdown, output a line containing exactly ${META_DELIMITER} and then ONE JSON object (no code fence):
{"takeaways": ["3-5 short sentences the reader should now understand"],
 "glossary": [{"term": "exact term as written in your text", "definition": "1-2 sentences pitched at this layer"}],
 "quiz": [{"q": "question", "options": ["...", "...", "...", "..."], "answer": 0, "why": "one sentence explaining the right answer"}]}
- glossary: ${glossaryCount} terms that appear verbatim in your text.
- quiz: exactly 3 questions that test understanding of ideas, not recall of wording. 4 options each. Plausible distractors. Vary the index of the correct answer.`;
}

const ASK_TASK: Record<AskAction, string> = {
  explain: 'Explain the selected passage more simply than the current layer does, in 2-4 short paragraphs. Use a concrete example.',
  analogy: 'Give one vivid everyday analogy for the selected passage. Then add a small two-column markdown table mapping each part of the analogy to the real concept.',
  why: 'Explain why the selected passage matters: first for the core idea of the document, then for a working software developer. Be concrete and brief.',
  ask: 'Answer the reader\'s question about the selected passage clearly and briefly. If the document does not answer it, say so and give your best grounded explanation.',
};

export function askPrompt(doc: SparkDoc, action: AskAction, selection: string, layer: LayerContent | undefined, context: string, question?: string) {
  const a = doc.analysis;
  return `${PERSONA}

DOCUMENT: ${a?.title ?? doc.meta.title}${a ? `\nGist: ${a.gist}` : ''}

${layer ? `The reader is on Layer ${layer.layer} (${layerDef(layer.layer)?.name}, audience: ${layerDef(layer.layer)?.audience}). Pitch your answer at that level.\n\nCURRENT LAYER TEXT\n<<<\n${layer.markdown.slice(0, 6000)}\n>>>\n` : 'The reader is reading the original document.'}
SOURCE MATERIAL
<<<
${context}
>>>

SELECTED PASSAGE
"""${selection}"""
${question ? `\nREADER'S QUESTION\n${question}\n` : ''}
TASK
${ASK_TASK[action]}
Answer in Markdown. No preamble. Keep it under 250 words.`;
}

export function guidePrompt(doc: SparkDoc, segments: Segment[]) {
  const listing = segments
    .map((s) => `[${s.id}]${s.heading ? ` (${s.heading})` : ''} ${s.text.slice(0, 280).replace(/\s+/g, ' ')}`)
    .join('\n');
  const learned = Object.values(doc.layers)
    .map((l) => `Layer ${l.layer} (${layerDef(l.layer)?.name}): ${l.takeaways.join(' ')}`)
    .join('\n');
  return `${PERSONA}

The reader has worked through five layers of explanation and is now about to read the original ${kindLabel(doc.analysis?.docType ?? doc.meta.docType)}.

WHAT EACH LAYER TAUGHT
${learned}

THE ORIGINAL, AS NUMBERED SEGMENTS (each truncated)
${listing}

TASK
Write margin annotations that guide the reader through the original. Choose the 12-25 most useful segments.
Return ONLY a JSON array of objects:
[{"segmentId": "s12", "kind": "key" | "tricky" | "skim" | "claim", "note": "at most 35 words in plain language", "layer": 1-5}]
- key: a load-bearing passage. Say what to take from it.
- tricky: a dense or confusing passage. Say how to decode it.
- skim: boilerplate or background that is safe to skim.
- claim: an independent patent claim (patents only). Say what it protects, in plain words.
- layer: the layer whose explanation helps most with this passage.
Use only segment ids from the list.`;
}

export function chatAnswerPrompt(doc: SparkDoc | undefined, question: string, layerN: number, context: string) {
  if (!doc) {
    return `${PERSONA}

The reader asks: ${question}

Answer helpfully and briefly. If they want to study a paper or patent, suggest: "@spark /explain <URL, patent number or pasted text>".`;
  }
  const def = layerDef(Math.min(Math.max(layerN, 1), LAYERS.length));
  return `${PERSONA}

The reader is studying "${doc.analysis?.title ?? doc.meta.title}" and is on Layer ${def.n} (${def.name}, audience: ${def.audience}). Pitch the answer at that level.

SOURCE MATERIAL
<<<
${context}
>>>

QUESTION
${question}

Answer in Markdown, grounded in the document. No preamble.`;
}

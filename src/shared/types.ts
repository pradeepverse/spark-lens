// Types shared by the extension host and the webview UI.

export type SourceKind = 'pdf' | 'url' | 'text' | 'patent';
export type DocType = 'patent' | 'paper' | 'article' | 'text';

export interface Segment {
  id: string;
  heading?: string;
  text: string;
  /** e.g. 'claim' for patent claims, 'abstract' */
  role?: 'abstract' | 'claim' | 'body';
}

export interface Progress {
  /** 1..5 are layers, 6 is the original document. */
  current: number;
  passed: number[];
  skipped: number[];
  readyAt?: number;
}

export interface DocMeta {
  id: string;
  title: string;
  kind: SourceKind;
  docType: DocType;
  source: string;
  addedAt: number;
  openedAt: number;
  words: number;
  gist?: string;
  domain?: string;
  difficulty?: number;
  byline?: string;
  progress: Progress;
}

export interface Analysis {
  title: string;
  docType: DocType;
  gist: string;
  domain: string;
  difficulty: number;
  whyItMatters: string;
  keyConcepts: string[];
  prerequisites: string[];
  outline: string[];
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  layer: number;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface LayerContent {
  layer: number;
  markdown: string;
  takeaways: string[];
  glossary: GlossaryEntry[];
  quiz: QuizQuestion[];
  model: string;
  generatedAt: number;
}

export type AnnotationKind = 'key' | 'tricky' | 'skim' | 'claim';

export interface Annotation {
  segmentId: string;
  kind: AnnotationKind;
  note: string;
  layer: number;
}

export type AskAction = 'explain' | 'analogy' | 'why' | 'ask';

export interface SparkNote {
  id: string;
  action: AskAction;
  selection: string;
  question?: string;
  answer: string;
  layer: number;
  createdAt: number;
}

export interface SparkDoc {
  meta: DocMeta;
  segments: Segment[];
  analysis?: Analysis;
  /** Condensed notes for documents too long to fit in the model context. */
  digest?: string;
  layers: Record<number, LayerContent>;
  annotations?: Annotation[];
  notes: SparkNote[];
}

export interface Streak {
  count: number;
  best: number;
  lastDay?: string;
}

export interface Profile {
  interests: string[];
  onboarded: boolean;
  streak: Streak;
  readyBadges: number;
  fontScale: number;
}

export interface FeedItem {
  kind: 'paper' | 'patent';
  id: string;
  title: string;
  summary: string;
  url: string;
  date?: string;
  interest: string;
  byline?: string;
}

export interface Feed {
  fetchedAt: number;
  interests: string[];
  items: FeedItem[];
  error?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  family: string;
  vendor: string;
  maxInputTokens: number;
}

export interface PersonalGlossaryEntry extends GlossaryEntry {
  docId: string;
  docTitle: string;
}

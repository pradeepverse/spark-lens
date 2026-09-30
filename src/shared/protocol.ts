import type {
  AskAction,
  DocMeta,
  Feed,
  LayerContent,
  ModelInfo,
  PersonalGlossaryEntry,
  Profile,
  SparkDoc,
  SparkNote,
} from './types';

export type IngestKind = 'auto' | 'url' | 'patent' | 'text' | 'pdf';

/** Messages the webview sends to the extension host. */
export type ToHost =
  | { type: 'ready' }
  | { type: 'ingest'; kind: IngestKind; value: string }
  | { type: 'pickPdf' }
  | { type: 'openDoc'; id: string }
  | { type: 'deleteDoc'; id: string }
  | { type: 'setInterests'; interests: string[] }
  | { type: 'refreshFeed' }
  | { type: 'openExternal'; url: string }
  | { type: 'selectModel'; id: string }
  | { type: 'setFontScale'; scale: number }
  | { type: 'generateLayer'; layer: number; differently?: boolean }
  | { type: 'quizResult'; layer: number; correct: number; total: number; skipped: boolean }
  | { type: 'ask'; action: AskAction; selection: string; question?: string; layer: number }
  | { type: 'deleteNote'; id: string }
  | { type: 'loadGuide'; regenerate?: boolean }
  | { type: 'retryPrepare' }
  | { type: 'cancel' };

export interface HomeState {
  library: DocMeta[];
  profile: Profile;
  feed?: Feed;
  feedLoading: boolean;
  models: ModelInfo[];
  modelId?: string;
  copilotMissing: boolean;
  busy?: string;
}

export type Stage = 'idle' | 'digesting' | 'analyzing' | 'ready' | 'error';

export interface ReaderState {
  doc: SparkDoc;
  profile: Profile;
  glossary: PersonalGlossaryEntry[];
  models: ModelInfo[];
  modelId?: string;
  stage: Stage;
  stageDetail?: string;
  error?: string;
}

/** Messages the extension host sends to the webview. */
export type ToWebview =
  | { type: 'home'; state: HomeState }
  | { type: 'reader'; state: ReaderState }
  | { type: 'layerStart'; layer: number }
  | { type: 'layerChunk'; layer: number; text: string }
  | { type: 'layerDone'; layer: number; content: LayerContent }
  | { type: 'layerError'; layer: number; message: string }
  | { type: 'askStart'; note: SparkNote }
  | { type: 'askChunk'; id: string; text: string }
  | { type: 'askDone'; note: SparkNote }
  | { type: 'askError'; id: string; message: string }
  | { type: 'guideStart' }
  | { type: 'guideDone' }
  | { type: 'guideError'; message: string }
  | { type: 'celebrate'; kind: 'ready' | 'pass'; layer?: number }
  | { type: 'toast'; kind: 'info' | 'error'; message: string };

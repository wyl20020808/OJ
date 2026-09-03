declare module '@ojplatform/online-code-editor' {
  import type { EditorHostContext } from '@ojplatform/online-code-editor/host/EditorHostContext';
  export interface EditorSlotContext { element: HTMLElement; value?: string; onChange?: (value: string) => void; hostContext?: EditorHostContext; }
  export interface OnlineCodeEditorPlugin { id: string; manifest: { id: string; version: string; apiVersion: string | number; contributes: { slots: readonly string[] } }; mount(context: EditorSlotContext): () => void; }
  const plugin: OnlineCodeEditorPlugin;
  export default plugin;
}
declare module '@ojplatform/online-code-editor/host/EditorHostContext' {
  export interface EditorHostContext { problemId: string; problemRevisionId: string; codeRunAdapter: unknown; submissionAdapter?: unknown; sampleProvider: unknown; checker?: 'EXACT_BYTES' | 'TOKEN_WHITESPACE'; onViewSubmission?: (submissionId: string) => void; }
}
declare module '@ojplatform/online-code-editor/run/HttpCodeRunAdapter' {
  export class HttpCodeRunAdapter { constructor(baseUrl?: string); }
}
declare module '@ojplatform/online-code-editor/submission/SubmissionAdapter' {
  export class HttpSubmissionAdapter { constructor(baseUrl?: string); }
}

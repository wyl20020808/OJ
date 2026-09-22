declare module '@ojplatform/online-code-editor' {
  import type { EditorHostContext } from '@ojplatform/online-code-editor/host/EditorHostContext';
  export interface EditorSlotContext {
    element: HTMLElement;
    value?: string;
    onChange?: (value: string) => void;
    hostContext?: EditorHostContext;
  }
  export interface OnlineCodeEditorPlugin {
    id: string;
    manifest: {
      id: string;
      version: string;
      apiVersion: string | number;
      contributes: { slots: readonly string[] };
    };
    mount(context: EditorSlotContext): () => void;
  }
  const plugin: OnlineCodeEditorPlugin;
  export default plugin;
}
declare module '@ojplatform/online-code-editor/host/EditorHostContext' {
  import type { DraftAdapter } from '@ojplatform/online-code-editor/draft/DraftAdapter';
  export interface EditorHostContext {
    problemId: string;
    problemRevisionId: string;
    codeRunAdapter: unknown;
    submissionAdapter?: unknown;
    sampleProvider: unknown;
    checker?: 'EXACT_BYTES' | 'TOKEN_WHITESPACE';
    onViewSubmission?: (submissionId: string) => void;
    language?: string;
    draftAdapter?: DraftAdapter;
  }
}
declare module '@ojplatform/online-code-editor/draft/DraftAdapter' {
  export interface DraftAdapter {
    load(identity: { problemId: string; language: string }): Promise<unknown>;
    save(request: {
      problemId: string;
      language: string;
      source: string;
      version?: number | null;
    }): Promise<unknown>;
  }
  export class HttpDraftAdapter implements DraftAdapter {
    constructor(baseUrl?: string);
    load(identity: { problemId: string; language: string }): Promise<unknown>;
    save(request: {
      problemId: string;
      language: string;
      source: string;
      version?: number | null;
    }): Promise<unknown>;
  }
}
declare module '@ojplatform/online-code-editor/run/HttpCodeRunAdapter' {
  export class HttpCodeRunAdapter {
    constructor(baseUrl?: string);
  }
}
declare module '@ojplatform/online-code-editor/submission/SubmissionAdapter' {
  export class HttpSubmissionAdapter {
    constructor(baseUrl?: string);
  }
}

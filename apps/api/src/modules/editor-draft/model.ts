export const MAX_DRAFT_SOURCE_BYTES = 512 * 1024;

export type EditorCodeDraft = {
  userId: string;
  problemId: string;
  language: string;
  source: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type SaveEditorCodeDraftInput = {
  userId: string;
  problemId: string;
  language: string;
  source: string;
  expectedVersion?: number | null;
};

export class EditorDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorDraftValidationError';
  }
}

export class EditorDraftConflictError extends Error {
  readonly current: EditorCodeDraft | undefined;
  constructor(current?: EditorCodeDraft) {
    super('Draft version is stale');
    this.name = 'EditorDraftConflictError';
    this.current = current;
  }
}

export const validDraftLanguage = (language: string) =>
  /^[a-z0-9][a-z0-9._-]{0,31}$/.test(language);

export const validateDraftInput = (input: SaveEditorCodeDraftInput) => {
  if (!input.userId || !input.problemId || !validDraftLanguage(input.language))
    throw new EditorDraftValidationError('Invalid draft identity');
  if (typeof input.source !== 'string')
    throw new EditorDraftValidationError('Invalid draft source');
  if (Buffer.byteLength(input.source, 'utf8') > MAX_DRAFT_SOURCE_BYTES)
    throw new EditorDraftValidationError('Draft source exceeds size limit');
  if (
    input.expectedVersion !== undefined &&
    input.expectedVersion !== null &&
    (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
  )
    throw new EditorDraftValidationError('Invalid draft version');
};

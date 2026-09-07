export type ProblemVisibility = 'private' | 'public';
export type ProblemStatus = 'draft' | 'published' | 'archived';
export const problemDifficulties = [
  '入门',
  '简单',
  '中等',
  '困难',
  '专家',
] as const;
export type ProblemDifficulty = (typeof problemDifficulties)[number];

export type ProblemExample = { input: string; output: string; note?: string };
export type ProblemSample = {
  ordinal: number;
  input: string;
  output: string;
  explanation?: string | null;
};
export type ProblemTag = {
  id: number;
  slug: string;
  name: string;
  category: string;
  displayOrder: number;
  isActive: boolean;
};

export type Problem = {
  id: string;
  publicNumber: number;
  publicId: string;
  slug: string;
  title: string;
  background: string;
  statement: string;
  inputDescription: string;
  outputDescription: string;
  examples: ProblemExample[];
  samples: ProblemSample[];
  constraints: string;
  notes: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
  visibility: ProblemVisibility;
  difficulty: ProblemDifficulty | null;
  status: ProblemStatus;
  testdataVersion: string | null;
  authorId: string | null;
  source?: string | null;
  sourceType?:
    'CREATOR' | 'EXTERNAL' | 'IMPORT' | 'TEST_FIXTURE' | 'API_AUTOMATION';
  tags: string[];
  tagDetails?: ProblemTag[];
  createdAt: string;
  updatedAt: string;
  currentRevisionId?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deleteReason?: string | null;
  provenance?: Record<string, unknown> | null;
};
export type ProblemCapabilities = {
  canEdit: boolean;
  canDelete?: boolean;
};
export type ProblemProjection = Problem & {
  capabilities: ProblemCapabilities;
};
export type ProblemRevision = Omit<Problem, 'currentRevisionId'> & {
  revisionId: string;
  revisionNumber: number;
  createdBy: string;
  createdAt: string;
};

export type ProblemCreateInput = Omit<
  Problem,
  | 'id'
  | 'publicNumber'
  | 'publicId'
  | 'createdAt'
  | 'updatedAt'
  | 'source'
  | 'tagDetails'
  | 'deletedAt'
  | 'deletedBy'
  | 'deleteReason'
> & { id?: string; tagIds?: number[] };
export type ProblemUpdateInput = Partial<
  Omit<
    Problem,
    | 'id'
    | 'publicNumber'
    | 'publicId'
    | 'createdAt'
    | 'updatedAt'
    | 'authorId'
    | 'source'
    | 'sourceType'
    | 'deletedAt'
    | 'deletedBy'
    | 'deleteReason'
    | 'tagDetails'
  >
> & { tagIds?: number[] };

export type AuthContext = {
  userId: string;
  sessionId?: string;
  strength?: string;
};
export type AuthorizationPolicy = {
  can(
    action: string,
    resource: string,
    context: AuthContext | undefined,
    target?: { id: string; type: string },
  ): Promise<boolean> | boolean;
};
export type AuditHook = {
  record(input: {
    actorUserId: string;
    action: string;
    resource: string;
    resourceId?: string;
    outcome: 'success' | 'denied';
    requestId?: string;
    occurredAt: string;
  }): Promise<void> | void;
};

export class ProblemValidationError extends Error {
  readonly details: Record<string, string>;
  constructor(details: Record<string, string>) {
    super('Problem validation failed');
    this.name = 'ProblemValidationError';
    this.details = details;
  }
}

export class ProblemNotFoundError extends Error {
  constructor() {
    super('Problem not found');
    this.name = 'ProblemNotFoundError';
  }
}

export class ProblemConflictError extends Error {
  constructor(message = 'Problem identifier or slug already exists') {
    super(message);
    this.name = 'ProblemConflictError';
  }
}
export class ProblemDeleteConflictError extends Error {
  constructor(message = 'Problem changed or is already deleted') {
    super(message);
    this.name = 'ProblemDeleteConflictError';
  }
}

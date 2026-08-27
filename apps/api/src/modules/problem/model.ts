export type ProblemVisibility = 'private' | 'public';
export type ProblemStatus = 'draft' | 'published' | 'archived';

export type ProblemExample = { input: string; output: string; note?: string };

export type Problem = {
  id: string;
  slug: string;
  title: string;
  statement: string;
  inputDescription: string;
  outputDescription: string;
  examples: ProblemExample[];
  constraints: string;
  notes: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
  visibility: ProblemVisibility;
  status: ProblemStatus;
  testdataVersion: string | null;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProblemCreateInput = Omit<
  Problem,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: string };
export type ProblemUpdateInput = Partial<
  Omit<Problem, 'id' | 'createdAt' | 'updatedAt' | 'authorId'>
>;

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
  ): Promise<boolean> | boolean;
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

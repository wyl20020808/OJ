export const CODE_RUN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'COMPILE_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT',
  'MEMORY_LIMIT',
  'INFRA_ERROR',
  'CANCELLED',
] as const;
export type CodeRunStatus = (typeof CODE_RUN_STATUSES)[number];
export type CodeRunCreateRequest = {
  language: 'cpp20';
  source: string;
  stdin: string;
};
export type CodeRunResult = {
  runId: string;
  status: CodeRunStatus;
  stdout?: string;
  stderr?: string;
  compilerDiagnostics?: string | null;
  exitCode?: number | null;
  timeMs?: number | null;
  memoryBytes?: number | null;
};

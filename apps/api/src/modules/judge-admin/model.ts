/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuthContext } from '../auth/types.js';

export type JudgeNode = {
  nodeId: string;
  incarnation: string;
  desiredState: string;
  observedState: string;
  runtimeVersion: string;
  maxConcurrentJobs: number;
  activeJobs: number;
  availableCapacity: number;
  lastHeartbeatAt: string | null;
  heartbeatAgeMs: number;
  capabilities: Record<string, unknown>;
  recentFailureCount: number;
  controlVersion: number;
};
export type JudgeAdminAdapter = {
  summary(): Promise<unknown>;
  nodes(query?: { limit?: number; cursor?: string }): Promise<unknown>;
  node(nodeId: string): Promise<unknown>;
  assignments(nodeId: string, query?: PageQuery): Promise<unknown>;
  jobs(nodeId: string, query?: PageQuery): Promise<unknown>;
  failures(nodeId: string, query?: PageQuery): Promise<unknown>;
  assignment(id: string): Promise<unknown>;
  metrics(): Promise<unknown>;
  policy?: () => Promise<unknown>;
  templates?: () => Promise<unknown>;
  hostCapacity?: () => Promise<unknown>;
  lifecycleCapabilities?: () => Promise<unknown>;
  lifecycleHistory?: (query?: PageQuery) => Promise<unknown>;
  autoscalerHistory?: (query?: PageQuery) => Promise<unknown>;
  addNode?: (input: AddNodeInput, headers?: RequestHeaders) => Promise<unknown>;
  lifecycle?: (
    action: 'start' | 'stop' | 'restart',
    nodeId: string,
    input: LifecycleInput,
    headers?: RequestHeaders,
  ) => Promise<unknown>;
  updatePolicy?: (
    input: PolicyMutationInput,
    headers?: RequestHeaders,
  ) => Promise<unknown>;
  setMode?: (
    input: ModeMutationInput,
    headers?: RequestHeaders,
  ) => Promise<unknown>;
  mutate(
    action: 'drain' | 'offline' | 'enable',
    nodeId: string,
    input: MutationInput,
    headers?: RequestHeaders,
  ): Promise<unknown>;
};
export type PageQuery = { limit?: number; cursor?: string };
export type AddNodeInput = {
  templateId: string;
  reason: string;
  count?: number;
  idempotencyKey: string;
};
export type LifecycleInput = MutationInput;
export type ModeMutationInput = {
  mode: 'MANUAL' | 'AUTOMATIC';
  reason: string;
  expectedControlVersion: number;
  idempotencyKey: string;
};
export type PoolPolicyInput = {
  templateId: string;
  minNodes: number;
  maxNodes: number;
  targetQueueWaitMs: number;
  fastScaleQueueWaitMs: number;
  pendingJobsScaleUpThreshold: number;
  scaleUpStep: number;
  fastScaleUpStep: number;
  scaleDownStep: number;
  scaleDownUtilizationThreshold: number;
  scaleDownIdleWindowMs: number;
  scaleUpCooldownMs: number;
  scaleDownCooldownMs: number;
  hostCpuReserve: number;
  hostMemoryReserve: number;
};
export type PolicyMutationInput = PoolPolicyInput & {
  reason: string;
  expectedControlVersion: number;
  idempotencyKey: string;
};
export type MutationInput = {
  reason: string;
  expectedIncarnation: string;
  expectedControlVersion: number;
  idempotencyKey: string;
};
export type RequestHeaders = {
  requestId: string;
  correlationId: string;
  idempotencyKey?: string;
};
export type JudgeAdminAudit = {
  actorUserId: string;
  permission: string;
  action: string;
  nodeId: string;
  expectedIncarnation?: string;
  expectedControlVersion?: number;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string;
  requestId: string;
  correlationId: string;
  idempotencyKey?: string;
  outcome: 'success' | 'denied' | 'failure';
  errorCode?: string;
  occurredAt: string;
};
export type JudgeAdminAuditRepository = {
  record(event: JudgeAdminAudit): Promise<void>;
};
export type JudgeAdminRouteOptions = {
  adapter: JudgeAdminAdapter;
  getAuthContext: (request: any) => Promise<AuthContext | undefined>;
  can: (
    ctx: AuthContext | undefined,
    permission: 'judge.view' | 'judge.manage' | 'judge.lifecycle',
  ) => Promise<boolean> | boolean;
  audit: JudgeAdminAuditRepository;
  csrf?: (request: any) => boolean;
};

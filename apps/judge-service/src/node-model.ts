export const JUDGE_NODE_STATES = [
  'REGISTERING',
  'ONLINE',
  'BUSY',
  'DRAINING',
  'OFFLINE',
  'UNHEALTHY',
] as const;

export type JudgeNodeState = (typeof JUDGE_NODE_STATES)[number];
export type JudgeNodeExecutionMode =
  'SAFE_FIXTURE_QUALIFICATION' | 'REAL_SANDBOXED_EXECUTION';
export type JudgeNodeChecker = 'EXACT_BYTES' | 'TOKEN_WHITESPACE';

export type JudgeNodeCapabilities = {
  languageProfiles: readonly ['cpp20-gcc-13-v1'];
  checkers: readonly JudgeNodeChecker[];
  executionModes: readonly JudgeNodeExecutionMode[];
  sandboxContractVersion: '2C.3';
  architecture: 'amd64';
  resourceClass: 'standard-v1';
};

export type JudgeNodeRegistration = {
  nodeId: string;
  incarnation: string;
  runtimeVersion: string;
  maxConcurrentJobs: number;
  capabilities: JudgeNodeCapabilities;
  metadata?: Readonly<Record<string, string>>;
};

export type JudgeNode = JudgeNodeRegistration & {
  state: JudgeNodeState;
  desiredState?: 'ONLINE' | 'DRAINING' | 'OFFLINE';
  observedState?: JudgeNodeState;
  controlVersion?: number;
  activeJobs: number;
  lastHeartbeatAt?: string;
};

export type RequiredNodeCapabilities = {
  languageProfile: 'cpp20-gcc-13-v1';
  executionMode: JudgeNodeExecutionMode;
  checker?: JudgeNodeChecker;
};

export type NodeScheduleResult =
  | { node: JudgeNode; reason: 'SCHEDULED' }
  | { node: undefined; reason: 'NO_COMPATIBLE_JUDGE_NODE' };

const nodeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const incarnationPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const validModes = new Set<JudgeNodeExecutionMode>([
  'SAFE_FIXTURE_QUALIFICATION',
  'REAL_SANDBOXED_EXECUTION',
]);
const validCheckers = new Set<JudgeNodeChecker>([
  'EXACT_BYTES',
  'TOKEN_WHITESPACE',
]);

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const unique = (value: readonly string[]) =>
  new Set(value).size === value.length;

export function assertJudgeNodeRegistration(
  value: unknown,
): asserts value is JudgeNodeRegistration {
  if (!object(value)) throw new Error('Invalid Judge node registration');
  if (
    typeof value.nodeId !== 'string' ||
    !nodeIdPattern.test(value.nodeId) ||
    typeof value.incarnation !== 'string' ||
    !incarnationPattern.test(value.incarnation) ||
    typeof value.runtimeVersion !== 'string' ||
    !versionPattern.test(value.runtimeVersion) ||
    typeof value.maxConcurrentJobs !== 'number' ||
    !Number.isInteger(value.maxConcurrentJobs) ||
    value.maxConcurrentJobs < 1 ||
    value.maxConcurrentJobs > 64
  )
    throw new Error('Invalid Judge node identity or capacity');

  if (!object(value.capabilities))
    throw new Error('Invalid Judge node capabilities');
  const capabilities = value.capabilities;
  if (
    !Array.isArray(capabilities.languageProfiles) ||
    capabilities.languageProfiles.length !== 1 ||
    capabilities.languageProfiles[0] !== 'cpp20-gcc-13-v1' ||
    !Array.isArray(capabilities.checkers) ||
    capabilities.checkers.length === 0 ||
    !capabilities.checkers.every(
      (checker) =>
        typeof checker === 'string' &&
        validCheckers.has(checker as JudgeNodeChecker),
    ) ||
    !unique(capabilities.checkers as string[]) ||
    !Array.isArray(capabilities.executionModes) ||
    capabilities.executionModes.length === 0 ||
    !capabilities.executionModes.every(
      (mode) =>
        typeof mode === 'string' &&
        validModes.has(mode as JudgeNodeExecutionMode),
    ) ||
    !unique(capabilities.executionModes as string[]) ||
    capabilities.sandboxContractVersion !== '2C.3' ||
    capabilities.architecture !== 'amd64' ||
    capabilities.resourceClass !== 'standard-v1'
  )
    throw new Error('Unsupported Judge node capabilities');

  if (value.metadata !== undefined) {
    if (!object(value.metadata) || Object.keys(value.metadata).length > 16)
      throw new Error('Invalid Judge node metadata');
    for (const [key, item] of Object.entries(value.metadata))
      if (
        !nodeIdPattern.test(key) ||
        typeof item !== 'string' ||
        item.length > 256 ||
        /[\0\r\n]/.test(item)
      )
        throw new Error('Invalid Judge node metadata');
  }
}

const transitions: Readonly<Record<JudgeNodeState, readonly JudgeNodeState[]>> =
  {
    REGISTERING: ['ONLINE', 'OFFLINE', 'UNHEALTHY'],
    ONLINE: ['BUSY', 'DRAINING', 'OFFLINE', 'UNHEALTHY'],
    BUSY: ['ONLINE', 'DRAINING', 'UNHEALTHY'],
    DRAINING: ['OFFLINE', 'UNHEALTHY'],
    OFFLINE: ['REGISTERING'],
    UNHEALTHY: ['REGISTERING', 'OFFLINE'],
  };

export function canTransitionJudgeNode(
  from: JudgeNodeState,
  to: JudgeNodeState,
): boolean {
  return transitions[from].includes(to);
}

export function transitionJudgeNode(
  node: JudgeNode,
  state: JudgeNodeState,
): JudgeNode {
  if (!canTransitionJudgeNode(node.state, state))
    throw new Error(`Invalid Judge node transition: ${node.state} -> ${state}`);
  if (state === 'OFFLINE' && node.state === 'DRAINING' && node.activeJobs !== 0)
    throw new Error('Draining Judge node still has active jobs');
  return { ...node, state };
}

const supports = (node: JudgeNode, required: RequiredNodeCapabilities) =>
  node.capabilities.languageProfiles[0] === required.languageProfile &&
  node.capabilities.executionModes.includes(required.executionMode) &&
  (!required.checker || node.capabilities.checkers.includes(required.checker));

export function scheduleJudgeNode(
  nodes: readonly JudgeNode[],
  required: RequiredNodeCapabilities,
  now = new Date(),
  unhealthyAfterMs = 15_000,
): NodeScheduleResult {
  const eligible = nodes.filter((node) => {
    if (
      (node.desiredState ?? 'ONLINE') !== 'ONLINE' ||
      !['ONLINE', 'BUSY'].includes(node.observedState ?? node.state) ||
      node.activeJobs < 0 ||
      node.activeJobs >= node.maxConcurrentJobs ||
      !node.lastHeartbeatAt ||
      !supports(node, required)
    )
      return false;
    const seen = Date.parse(node.lastHeartbeatAt);
    return Number.isFinite(seen) && now.getTime() - seen <= unhealthyAfterMs;
  });
  if (eligible.length === 0)
    return { node: undefined, reason: 'NO_COMPATIBLE_JUDGE_NODE' };
  eligible.sort(
    (left, right) =>
      left.activeJobs / left.maxConcurrentJobs -
        right.activeJobs / right.maxConcurrentJobs ||
      left.nodeId.localeCompare(right.nodeId),
  );
  return { node: eligible[0]!, reason: 'SCHEDULED' };
}

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';

export type JudgeNodeTemplate = {
  templateId: string;
  displayName: string;
  executable: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
  maxConcurrentJobs: number;
  cpuUnits: number;
  memoryMb: number;
  enabled: boolean;
};
export type HostCapacity = {
  configuredCpuUnits: number;
  availableCpuUnits: number;
  configuredMemoryMb: number;
  availableMemoryMb: number;
};
type Owned = {
  nodeId: string;
  generation: number;
  nonce: string;
  pid: number;
  startedAt: number;
  executable: string;
  child: ChildProcess;
  incarnation: string;
};
export type HostOperation = {
  operationId: string;
  nodeId: string;
  status: 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED';
  incarnation?: string;
};

/** Narrow local process boundary. UI never supplies executable, args or env. */
export class LocalJudgeHostAgent {
  private readonly owned = new Map<string, Owned>();
  private readonly operations = new Map<string, HostOperation>();
  private generation = 0;
  constructor(
    private readonly templates: readonly JudgeNodeTemplate[],
    private readonly capacity: HostCapacity,
  ) {}
  listTemplates() {
    return this.templates.map((template) => ({
      templateId: template.templateId,
      displayName: template.displayName,
      maxConcurrentJobs: template.maxConcurrentJobs,
      cpuUnits: template.cpuUnits,
      memoryMb: template.memoryMb,
      enabled: template.enabled,
    }));
  }
  hostCapacity() {
    const used = [...this.owned.values()].length;
    return {
      ...this.capacity,
      currentNodes: used,
      maxAdditionalNodes: Math.max(
        0,
        Math.floor(
          Math.min(
            this.capacity.availableCpuUnits /
              Math.max(1, this.templates[0]?.cpuUnits ?? 1),
            this.capacity.availableMemoryMb /
              Math.max(1, this.templates[0]?.memoryMb ?? 1),
          ),
        ),
      ),
    };
  }
  listOwned() {
    return [...this.owned.values()].map((x) => ({
      nodeId: x.nodeId,
      pid: x.pid,
      generation: x.generation,
      startedAt: new Date(x.startedAt).toISOString(),
      incarnation: x.incarnation,
    }));
  }
  operationsHistory() {
    return [...this.operations.values()]
      .slice(-200)
      .map((x) => structuredClone(x));
  }
  async start(input: {
    templateId: string;
    nodeId: string;
  }): Promise<HostOperation> {
    if (!/^[A-Za-z0-9._:-]{1,96}$/.test(input.nodeId))
      throw new Error('INVALID_NODE_ID');
    const template = this.templates.find(
      (x) => x.templateId === input.templateId && x.enabled,
    );
    if (!template) throw new Error('TEMPLATE_NOT_FOUND_OR_DISABLED');
    const prior = this.owned.get(input.nodeId);
    if (prior && !prior.child.killed)
      return {
        operationId:
          [...this.operations.values()].find(
            (x) => x.nodeId === input.nodeId && x.status === 'RUNNING',
          )?.operationId ?? 'IDEMPOTENT',
        nodeId: input.nodeId,
        status: 'RUNNING',
        incarnation: prior.incarnation,
      };
    const operationId = randomUUID();
    const nonce = randomUUID();
    const incarnation = randomUUID();
    const child = spawn(
      template.executable,
      [
        ...template.args,
        `--node-id=${input.nodeId}`,
        `--incarnation=${incarnation}`,
        `--launch-nonce=${nonce}`,
      ],
      {
        env: {
          ...template.env,
          OJ_JUDGE_NODE_ID: input.nodeId,
          OJ_JUDGE_NODE_INCARNATION: incarnation,
        },
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    const owned: Owned = {
      nodeId: input.nodeId,
      generation: ++this.generation,
      nonce,
      pid: child.pid ?? -1,
      startedAt: Date.now(),
      executable: template.executable,
      child,
      incarnation,
    };
    this.owned.set(input.nodeId, owned);
    const op: HostOperation = {
      operationId,
      nodeId: input.nodeId,
      status: 'RUNNING',
      incarnation,
    };
    this.operations.set(operationId, op);
    child.once('exit', () => {
      if (this.owned.get(input.nodeId)?.nonce === nonce)
        this.owned.delete(input.nodeId);
    });
    return op;
  }
  async stop(input: { nodeId: string }): Promise<HostOperation> {
    const owned = this.owned.get(input.nodeId);
    if (!owned) throw new Error('NODE_NOT_FOUND');
    const operationId = randomUUID();
    const op: HostOperation = {
      operationId,
      nodeId: input.nodeId,
      status: 'STOPPING',
      incarnation: owned.incarnation,
    };
    this.operations.set(operationId, op);
    if (this.owned.get(input.nodeId)?.nonce !== owned.nonce)
      throw new Error('PROCESS_IDENTITY_MISMATCH');
    owned.child.kill();
    this.owned.delete(input.nodeId);
    op.status = 'STOPPED';
    return op;
  }
  async restart(input: { templateId: string; nodeId: string }) {
    if (this.owned.has(input.nodeId)) await this.stop({ nodeId: input.nodeId });
    return this.start(input);
  }
}

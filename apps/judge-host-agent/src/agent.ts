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

const validTemplateId = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,96}$/.test(value);

const validateTemplate = (template: JudgeNodeTemplate) => {
  if (
    !validTemplateId(template.templateId) ||
    typeof template.displayName !== 'string' ||
    template.displayName.length === 0 ||
    template.displayName.length > 128 ||
    typeof template.executable !== 'string' ||
    template.executable.length === 0 ||
    template.executable.length > 260 ||
    !Array.isArray(template.args) ||
    !template.args.every(
      (arg) =>
        typeof arg === 'string' && arg.length <= 512 && !/[\0\r\n]/.test(arg),
    ) ||
    (template.env !== undefined &&
      (!template.env ||
        Object.keys(template.env).length > 32 ||
        Object.entries(template.env).some(
          ([key, value]) =>
            !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) ||
            typeof value !== 'string' ||
            value.length > 1024 ||
            /[\0\r\n]/.test(value),
        ))) ||
    !Number.isInteger(template.maxConcurrentJobs) ||
    template.maxConcurrentJobs < 1 ||
    template.maxConcurrentJobs > 64 ||
    !Number.isFinite(template.cpuUnits) ||
    template.cpuUnits <= 0 ||
    !Number.isFinite(template.memoryMb) ||
    template.memoryMb <= 0 ||
    typeof template.enabled !== 'boolean'
  )
    throw new Error('INVALID_TRUSTED_TEMPLATE_CONFIGURATION');
};

/** Narrow local process boundary. UI never supplies executable, args or env. */
export class LocalJudgeHostAgent {
  private readonly owned = new Map<string, Owned>();
  private readonly operations = new Map<string, HostOperation>();
  private generation = 0;
  private readonly locks = new Map<string, Promise<unknown>>();
  constructor(
    private readonly templates: readonly JudgeNodeTemplate[],
    private readonly capacity: HostCapacity,
  ) {
    const ids = new Set<string>();
    for (const template of templates) {
      validateTemplate(template);
      if (ids.has(template.templateId))
        throw new Error('DUPLICATE_TRUSTED_TEMPLATE_ID');
      ids.add(template.templateId);
    }
    if (
      !Number.isFinite(capacity.configuredCpuUnits) ||
      capacity.configuredCpuUnits <= 0 ||
      !Number.isFinite(capacity.availableCpuUnits) ||
      capacity.availableCpuUnits < 0 ||
      capacity.availableCpuUnits > capacity.configuredCpuUnits ||
      !Number.isFinite(capacity.configuredMemoryMb) ||
      capacity.configuredMemoryMb <= 0 ||
      !Number.isFinite(capacity.availableMemoryMb) ||
      capacity.availableMemoryMb < 0 ||
      capacity.availableMemoryMb > capacity.configuredMemoryMb
    )
      throw new Error('INVALID_HOST_CAPACITY');
  }
  async listTemplates() {
    return this.templates.map((template) => ({
      templateId: template.templateId,
      displayName: template.displayName,
      maxConcurrentJobs: template.maxConcurrentJobs,
      cpuUnits: template.cpuUnits,
      memoryMb: template.memoryMb,
      enabled: template.enabled,
    }));
  }
  async hostCapacity() {
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
  async listOwned() {
    return [...this.owned.values()].map((x) => ({
      nodeId: x.nodeId,
      pid: x.pid,
      generation: x.generation,
      startedAt: new Date(x.startedAt).toISOString(),
      incarnation: x.incarnation,
    }));
  }
  async operationsHistory() {
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
    const priorLock = this.locks.get(input.nodeId);
    if (priorLock) await priorLock;
    const operation = this.startUnlocked(input);
    this.locks.set(input.nodeId, operation);
    try {
      return await operation;
    } finally {
      if (this.locks.get(input.nodeId) === operation)
        this.locks.delete(input.nodeId);
    }
  }
  private async startUnlocked(input: {
    templateId: string;
    nodeId: string;
  }): Promise<HostOperation> {
    const template = this.templates.find(
      (x) => x.templateId === input.templateId && x.enabled,
    );
    if (!template) throw new Error('TEMPLATE_NOT_FOUND_OR_DISABLED');
    const prior = this.owned.get(input.nodeId);
    if (prior && this.isOwnedProcessAlive(prior))
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
    try {
      await new Promise<void>((resolve, reject) => {
        const onSpawn = () => {
          child.off('error', onError);
          resolve();
        };
        const onError = () => {
          child.off('spawn', onSpawn);
          reject(new Error('PROCESS_START_FAILED'));
        };
        child.once('spawn', onSpawn);
        child.once('error', onError);
      });
    } catch {
      // A failed spawn may still leave a partially-created child on some hosts.
      try {
        if (child.pid) child.kill('SIGTERM');
      } catch {
        // Ignore cleanup failures; the process was never accepted as owned.
      }
      throw new Error('PROCESS_START_FAILED');
    }
    if (!child.pid || child.exitCode !== null)
      throw new Error('PROCESS_START_FAILED');
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
  async stop(input: {
    nodeId: string;
    expectedIncarnation?: string;
    activeJobs?: number;
  }): Promise<HostOperation> {
    const priorLock = this.locks.get(input.nodeId);
    if (priorLock) await priorLock;
    const operation = this.stopUnlocked(input);
    this.locks.set(input.nodeId, operation);
    try {
      return await operation;
    } finally {
      if (this.locks.get(input.nodeId) === operation)
        this.locks.delete(input.nodeId);
    }
  }
  private async stopUnlocked(input: {
    nodeId: string;
    expectedIncarnation?: string;
    activeJobs?: number;
  }): Promise<HostOperation> {
    const owned = this.owned.get(input.nodeId);
    if (!owned) throw new Error('NODE_NOT_FOUND');
    if (
      input.expectedIncarnation &&
      input.expectedIncarnation !== owned.incarnation
    )
      throw new Error('STALE_NODE_INCARNATION');
    if ((input.activeJobs ?? 0) > 0) throw new Error('ACTIVE_JOBS');
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
    if (!this.isOwnedProcessAlive(owned)) {
      this.owned.delete(input.nodeId);
      op.status = 'STOPPED';
      return op;
    }
    let exited = owned.child.exitCode !== null;
    let timer: NodeJS.Timeout | undefined;
    await new Promise<void>((resolve) => {
      const onExit = () => {
        exited = true;
        if (timer) clearTimeout(timer);
        resolve();
      };
      if (exited) return resolve();
      owned.child.once('exit', onExit);
      try {
        if (!owned.child.kill('SIGTERM')) {
          if (owned.child.exitCode !== null) onExit();
          else resolve();
        }
      } catch {
        resolve();
      }
      timer = setTimeout(resolve, 5000);
      timer.unref();
    });
    if (!exited) {
      op.status = 'FAILED';
      throw new Error('DRAIN_TIMEOUT');
    }
    this.owned.delete(input.nodeId);
    op.status = 'STOPPED';
    return op;
  }
  private isOwnedProcessAlive(owned: Owned) {
    if (owned.child.pid !== owned.pid || owned.child.killed) return false;
    try {
      process.kill(owned.pid, 0);
      return true;
    } catch (error) {
      // EPERM means the PID exists but is not signalable by this account.
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }
  async restart(input: {
    templateId: string;
    nodeId: string;
    expectedIncarnation?: string;
    activeJobs?: number;
  }) {
    const priorLock = this.locks.get(input.nodeId);
    if (priorLock) await priorLock;
    const operation = (async () => {
      const current = this.owned.get(input.nodeId);
      if (current) {
        if (
          input.expectedIncarnation &&
          input.expectedIncarnation !== current.incarnation
        )
          throw new Error('STALE_NODE_INCARNATION');
        await this.stopUnlocked({
          nodeId: input.nodeId,
          ...(input.expectedIncarnation
            ? { expectedIncarnation: input.expectedIncarnation }
            : {}),
          ...(input.activeJobs !== undefined
            ? { activeJobs: input.activeJobs }
            : {}),
        });
      }
      return this.startUnlocked(input);
    })();
    this.locks.set(input.nodeId, operation);
    try {
      return await operation;
    } finally {
      if (this.locks.get(input.nodeId) === operation)
        this.locks.delete(input.nodeId);
    }
  }
}

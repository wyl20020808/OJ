import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';

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
  templateId: string;
  cpuUnits: number;
  memoryMb: number;
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

type PersistedOwned = {
  nodeId: string;
  templateId: string;
  cpuUnits: number;
  memoryMb: number;
  generation: number;
  nonce: string;
  pid: number;
  startedAt: number;
  executable: string;
  incarnation: string;
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
  private readonly starting = new Map<
    string,
    Pick<Owned, 'templateId' | 'cpuUnits' | 'memoryMb'>
  >();
  private readonly operations = new Map<string, HostOperation>();
  private generation = 0;
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly unreconciledNodePids = new Map<string, number>();
  private readonly statePath: string | undefined;
  private readonly ready: Promise<void>;
  private initializationError?: Error;
  constructor(
    private readonly templates: readonly JudgeNodeTemplate[],
    private readonly capacity: HostCapacity,
    options: { statePath?: string } = {},
  ) {
    this.statePath = options.statePath;
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
    this.ready = this.reconcilePersistedState();
  }
  private async ensureReady() {
    await this.ready;
    if (this.initializationError) throw this.initializationError;
  }
  private async reconcilePersistedState() {
    if (!this.statePath) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.statePath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.initializationError = new Error('HOST_AGENT_STATE_UNREADABLE');
      return;
    }
    const items =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as { owned?: unknown }).owned
        : undefined;
    if (!Array.isArray(items)) {
      this.initializationError = new Error('HOST_AGENT_STATE_INVALID');
      return;
    }
    // Never adopt a process after an Agent restart without a child handle and
    // independently verified executable identity. This makes PID reuse fail
    // closed; operators can inspect the reconciliation failure and clean up.
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const value = item as Partial<PersistedOwned>;
      const pid = value.pid;
      if (
        typeof value.nodeId !== 'string' ||
        typeof pid !== 'number' ||
        !Number.isInteger(pid) ||
        pid <= 0 ||
        typeof value.incarnation !== 'string'
      )
        continue;
      try {
        process.kill(pid, 0);
      } catch {
        continue;
      }
      this.unreconciledNodePids.set(value.nodeId, pid);
      const operationId = `reconcile-${randomUUID()}`;
      this.operations.set(operationId, {
        operationId,
        nodeId: value.nodeId,
        status: 'FAILED',
        incarnation: value.incarnation,
      });
    }
  }
  private async persistState(owned = [...this.owned.values()]) {
    if (!this.statePath) return;
    const payload = JSON.stringify({
      version: 1,
      owned: owned.map((value) => ({
        nodeId: value.nodeId,
        templateId: value.templateId,
        cpuUnits: value.cpuUnits,
        memoryMb: value.memoryMb,
        generation: value.generation,
        nonce: value.nonce,
        pid: value.pid,
        startedAt: value.startedAt,
        executable: value.executable,
        incarnation: value.incarnation,
      })),
    });
    const temporary = `${this.statePath}.${process.pid}.tmp`;
    await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.statePath);
  }
  async listTemplates() {
    await this.ensureReady();
    return this.templates.map((template) => ({
      templateId: template.templateId,
      displayName: template.displayName,
      maxConcurrentJobs: template.maxConcurrentJobs,
      cpuUnits: template.cpuUnits,
      memoryMb: template.memoryMb,
      enabled: template.enabled,
    }));
  }
  private remainingCapacity() {
    if (this.unreconciledNodePids.size > 0) return { cpuUnits: 0, memoryMb: 0 };
    const allocated = [...this.owned.values(), ...this.starting.values()];
    return {
      cpuUnits: Math.max(
        0,
        this.capacity.availableCpuUnits -
          allocated.reduce((sum, item) => sum + item.cpuUnits, 0),
      ),
      memoryMb: Math.max(
        0,
        this.capacity.availableMemoryMb -
          allocated.reduce((sum, item) => sum + item.memoryMb, 0),
      ),
    };
  }
  private enabledTemplate(templateId: string) {
    const template = this.templates.find(
      (x) => x.templateId === templateId && x.enabled,
    );
    if (!template) throw new Error('TEMPLATE_NOT_FOUND_OR_DISABLED');
    return template;
  }
  private hasCapacity(
    template: Pick<JudgeNodeTemplate, 'cpuUnits' | 'memoryMb'>,
  ) {
    const remaining = this.remainingCapacity();
    return (
      remaining.cpuUnits >= template.cpuUnits &&
      remaining.memoryMb >= template.memoryMb
    );
  }
  async hostCapacity(templateId?: string) {
    await this.ensureReady();
    const template = templateId ? this.enabledTemplate(templateId) : undefined;
    const remaining = this.remainingCapacity();
    return {
      configuredCpuUnits: this.capacity.configuredCpuUnits,
      availableCpuUnits: remaining.cpuUnits,
      configuredMemoryMb: this.capacity.configuredMemoryMb,
      availableMemoryMb: remaining.memoryMb,
      currentNodes: this.owned.size,
      startingNodes: this.starting.size,
      unreconciledNodes: this.unreconciledNodePids.size,
      maxAdditionalNodes: Math.max(
        0,
        Math.floor(
          Math.min(
            template ? remaining.cpuUnits / template.cpuUnits : 0,
            template ? remaining.memoryMb / template.memoryMb : 0,
          ),
        ),
      ),
      ...(template
        ? { nodeCpuUnits: template.cpuUnits, nodeMemoryMb: template.memoryMb }
        : {}),
    };
  }
  async listOwned() {
    await this.ensureReady();
    return [...this.owned.values()].map((x) => ({
      nodeId: x.nodeId,
      templateId: x.templateId,
      cpuUnits: x.cpuUnits,
      memoryMb: x.memoryMb,
      pid: x.pid,
      generation: x.generation,
      startedAt: new Date(x.startedAt).toISOString(),
      incarnation: x.incarnation,
    }));
  }
  async operationsHistory() {
    await this.ensureReady();
    return [...this.operations.values()]
      .slice(-200)
      .map((x) => structuredClone(x));
  }
  async start(input: {
    templateId: string;
    nodeId: string;
  }): Promise<HostOperation> {
    await this.ensureReady();
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
    const unreconciledPid = this.unreconciledNodePids.get(input.nodeId);
    if (unreconciledPid !== undefined) {
      try {
        process.kill(unreconciledPid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
          this.unreconciledNodePids.delete(input.nodeId);
        } else {
          throw new Error('NODE_OWNERSHIP_RECONCILIATION_REQUIRED');
        }
      }
      if (this.unreconciledNodePids.has(input.nodeId))
        throw new Error('NODE_OWNERSHIP_RECONCILIATION_REQUIRED');
    }
    const template = this.enabledTemplate(input.templateId);
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
    if (!this.hasCapacity(template)) throw new Error('HOST_CAPACITY_EXHAUSTED');
    this.starting.set(input.nodeId, {
      templateId: template.templateId,
      cpuUnits: template.cpuUnits,
      memoryMb: template.memoryMb,
    });
    try {
      const operationId = randomUUID();
      const nonce = randomUUID();
      const incarnation = randomUUID();
      const child = spawn(template.executable, template.args, {
        env: {
          ...template.env,
          WORKER_ID: input.nodeId,
          OJ_JUDGE_NODE_ID: input.nodeId,
          OJ_JUDGE_NODE_INCARNATION: incarnation,
          OJ_JUDGE_LAUNCH_NONCE: nonce,
        },
        stdio: 'ignore',
        windowsHide: true,
      });
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
        templateId: template.templateId,
        cpuUnits: template.cpuUnits,
        memoryMb: template.memoryMb,
        generation: ++this.generation,
        nonce,
        pid: child.pid ?? -1,
        startedAt: Date.now(),
        executable: template.executable,
        child,
        incarnation,
      };
      this.owned.set(input.nodeId, owned);
      try {
        await this.persistState();
      } catch {
        this.owned.delete(input.nodeId);
        try {
          child.kill('SIGTERM');
        } catch {
          // Best-effort cleanup after a failed ownership commit.
        }
        throw new Error('HOST_AGENT_STATE_WRITE_FAILED');
      }
      const op: HostOperation = {
        operationId,
        nodeId: input.nodeId,
        status: 'RUNNING',
        incarnation,
      };
      this.operations.set(operationId, op);
      child.once('exit', () => {
        if (this.owned.get(input.nodeId)?.nonce !== nonce) return;
        this.owned.delete(input.nodeId);
        void this.persistState().catch(() => undefined);
      });
      return op;
    } finally {
      this.starting.delete(input.nodeId);
    }
  }
  async stop(input: {
    nodeId: string;
    expectedIncarnation?: string;
    activeJobs?: number;
  }): Promise<HostOperation> {
    await this.ensureReady();
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
      await this.persistState();
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
    await this.persistState();
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
    await this.ensureReady();
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

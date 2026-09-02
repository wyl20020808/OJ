import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalJudgeHostAgent } from '../apps/judge-host-agent/src/agent.js';
import { buildJudgeHostAgentServer } from '../apps/judge-host-agent/src/http.js';

describe('local judge host agent', () => {
  it('only starts enabled trusted templates and is idempotent', async () => {
    const agent = new LocalJudgeHostAgent(
      [
        {
          templateId: 'node-v1',
          displayName: 'Node V1',
          executable: process.execPath,
          args: ['-e', 'setTimeout(() => {}, 1000)'],
          maxConcurrentJobs: 1,
          cpuUnits: 1,
          memoryMb: 64,
          enabled: true,
        },
      ],
      {
        configuredCpuUnits: 4,
        availableCpuUnits: 4,
        configuredMemoryMb: 1024,
        availableMemoryMb: 1024,
      },
    );
    await expect(
      agent.start({ templateId: 'unknown', nodeId: 'a' }),
    ).rejects.toThrow('TEMPLATE_NOT_FOUND');
    const first = await agent.start({ templateId: 'node-v1', nodeId: 'a' });
    const second = await agent.start({ templateId: 'node-v1', nodeId: 'a' });
    expect(second.incarnation).toBe(first.incarnation);
    expect(await agent.listOwned()).toHaveLength(1);
    await agent.stop({ nodeId: 'a' });
  });
  it('restart creates a new incarnation', async () => {
    const agent = new LocalJudgeHostAgent(
      [
        {
          templateId: 'node-v1',
          displayName: 'Node V1',
          executable: process.execPath,
          args: ['-e', 'setTimeout(() => {}, 1000)'],
          maxConcurrentJobs: 1,
          cpuUnits: 1,
          memoryMb: 64,
          enabled: true,
        },
      ],
      {
        configuredCpuUnits: 4,
        availableCpuUnits: 4,
        configuredMemoryMb: 1024,
        availableMemoryMb: 1024,
      },
    );
    const a = await agent.start({ templateId: 'node-v1', nodeId: 'a' });
    await expect(
      agent.restart({
        templateId: 'node-v1',
        nodeId: 'a',
        expectedIncarnation: 'stale-incarnation',
      }),
    ).rejects.toThrow('STALE_NODE_INCARNATION');
    const [b, c] = await Promise.all([
      agent.restart({
        templateId: 'node-v1',
        nodeId: 'a',
        expectedIncarnation: a.incarnation!,
      }),
      agent.restart({ templateId: 'node-v1', nodeId: 'a' }),
    ]);
    expect(b.incarnation).not.toBe(a.incarnation);
    expect(c.incarnation).not.toBe(b.incarnation);
    expect((await agent.listOwned())[0]?.incarnation).toBe(c.incarnation);
    await agent.stop({ nodeId: 'a' });
  });

  it('rejects lifecycle stop while active jobs are present', async () => {
    const agent = new LocalJudgeHostAgent(
      [
        {
          templateId: 'node-v1',
          displayName: 'Node V1',
          executable: process.execPath,
          args: ['-e', 'setTimeout(() => {}, 1000)'],
          maxConcurrentJobs: 1,
          cpuUnits: 1,
          memoryMb: 64,
          enabled: true,
        },
      ],
      {
        configuredCpuUnits: 2,
        availableCpuUnits: 2,
        configuredMemoryMb: 512,
        availableMemoryMb: 512,
      },
    );
    const started = await agent.start({
      templateId: 'node-v1',
      nodeId: 'active',
    });
    await expect(
      agent.stop({
        nodeId: 'active',
        expectedIncarnation: started.incarnation!,
        activeJobs: 1,
      }),
    ).rejects.toThrow('ACTIVE_JOBS');
    await agent.stop({
      nodeId: 'active',
      expectedIncarnation: started.incarnation!,
    });
  });

  it('fails closed when a restarted host agent sees persisted live ownership', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oj-host-agent-'));
    const statePath = join(directory, 'state.json');
    const templates = [
      {
        templateId: 'node-v1',
        displayName: 'Node V1',
        executable: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 5000)'],
        maxConcurrentJobs: 1,
        cpuUnits: 1,
        memoryMb: 64,
        enabled: true,
      },
    ] as const;
    const capacity = {
      configuredCpuUnits: 2,
      availableCpuUnits: 2,
      configuredMemoryMb: 512,
      availableMemoryMb: 512,
    };
    const owner = new LocalJudgeHostAgent(templates, capacity, { statePath });
    const started = await owner.start({
      templateId: 'node-v1',
      nodeId: 'persisted',
    });
    const restarted = new LocalJudgeHostAgent(templates, capacity, {
      statePath,
    });

    expect(await restarted.listOwned()).toEqual([]);
    expect(await restarted.operationsHistory()).toEqual([
      expect.objectContaining({
        nodeId: 'persisted',
        status: 'FAILED',
        incarnation: started.incarnation,
      }),
    ]);
    await expect(
      restarted.start({ templateId: 'node-v1', nodeId: 'persisted' }),
    ).rejects.toThrow('NODE_OWNERSHIP_RECONCILIATION_REQUIRED');

    await owner.stop({
      nodeId: 'persisted',
      ...(started.incarnation
        ? { expectedIncarnation: started.incarnation }
        : {}),
    });
    await rm(directory, { recursive: true, force: true });
  });

  it('protects the HTTP boundary with a separate credential', async () => {
    const agent = new LocalJudgeHostAgent([], {
      configuredCpuUnits: 2,
      availableCpuUnits: 2,
      configuredMemoryMb: 512,
      availableMemoryMb: 512,
    });
    const app = await buildJudgeHostAgentServer(
      agent,
      'host-agent-secret-123',
      { logger: false },
    );
    expect(
      (await app.inject({ method: 'GET', url: '/v1/templates' })).statusCode,
    ).toBe(401);
    const templates = await app.inject({
      method: 'GET',
      url: '/v1/templates',
      headers: { 'x-judge-host-agent-token': 'host-agent-secret-123' },
    });
    expect(templates.statusCode).toBe(200);
    expect(templates.json()).toEqual({ items: [] });
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/nodes/start',
      headers: { 'x-judge-host-agent-token': 'host-agent-secret-123' },
      payload: {
        templateId: 'unknown',
        nodeId: 'node-a',
        executable: 'cmd.exe',
        args: ['/c', 'bad'],
      },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toMatchObject({
      code: 'TEMPLATE_NOT_FOUND_OR_DISABLED',
    });
    await app.close();
  });
});

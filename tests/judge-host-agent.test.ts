import { describe, expect, it } from 'vitest';
import { LocalJudgeHostAgent } from '../apps/judge-host-agent/src/agent.js';

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
    expect(agent.listOwned()).toHaveLength(1);
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
    const b = await agent.restart({ templateId: 'node-v1', nodeId: 'a' });
    expect(b.incarnation).not.toBe(a.incarnation);
    await agent.stop({ nodeId: 'a' });
  });
});

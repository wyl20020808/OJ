import { describe, expect, it } from 'vitest';
import {
  assertJudgeNodeRegistration,
  canTransitionJudgeNode,
  scheduleJudgeNode,
  transitionJudgeNode,
  type JudgeNode,
} from '../apps/judge-service/src/node-model.js';

const registration = {
  nodeId: 'node-a',
  incarnation: 'incarnation-a1',
  runtimeVersion: '2c7b-v1',
  maxConcurrentJobs: 2,
  capabilities: {
    languageProfiles: ['cpp20-gcc-13-v1'],
    checkers: ['EXACT_BYTES', 'TOKEN_WHITESPACE'],
    executionModes: ['REAL_SANDBOXED_EXECUTION'],
    sandboxContractVersion: '2C.3',
    architecture: 'amd64',
    resourceClass: 'standard-v1',
  },
} as const;

const node = (overrides: Partial<JudgeNode> = {}): JudgeNode => ({
  ...registration,
  state: 'ONLINE',
  activeJobs: 0,
  lastHeartbeatAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

describe('Phase 2C.7B Judge node domain model', () => {
  it('accepts a stable node identity with a fresh incarnation and rejects unsafe input', () => {
    expect(() => assertJudgeNodeRegistration(registration)).not.toThrow();
    expect(() =>
      assertJudgeNodeRegistration({
        ...registration,
        incarnation: 'old\nincarnation',
      }),
    ).toThrow('identity');
    expect(() =>
      assertJudgeNodeRegistration({
        ...registration,
        capabilities: { ...registration.capabilities, checkers: ['FLOAT'] },
      }),
    ).toThrow('Unsupported');
  });

  it('allows only explicit state transitions and blocks premature drain completion', () => {
    expect(canTransitionJudgeNode('REGISTERING', 'ONLINE')).toBe(true);
    expect(canTransitionJudgeNode('ONLINE', 'OFFLINE')).toBe(true);
    expect(canTransitionJudgeNode('OFFLINE', 'ONLINE')).toBe(false);
    expect(() =>
      transitionJudgeNode(node({ state: 'OFFLINE' }), 'ONLINE'),
    ).toThrow('Invalid Judge node transition');
    expect(() =>
      transitionJudgeNode(
        node({ state: 'DRAINING', activeJobs: 1 }),
        'OFFLINE',
      ),
    ).toThrow('still has active jobs');
  });

  it('filters unavailable and incompatible nodes and selects normalized load with a stable node ID tie break', () => {
    const result = scheduleJudgeNode(
      [
        node({ nodeId: 'node-z', activeJobs: 1 }),
        node({ nodeId: 'node-a', activeJobs: 0, maxConcurrentJobs: 1 }),
        node({
          nodeId: 'node-offline',
          state: 'OFFLINE',
          activeJobs: 0,
        }),
        node({
          nodeId: 'node-incompatible',
          activeJobs: 0,
          capabilities: {
            ...registration.capabilities,
            executionModes: ['SAFE_FIXTURE_QUALIFICATION'],
          },
        }),
      ],
      {
        languageProfile: 'cpp20-gcc-13-v1',
        executionMode: 'REAL_SANDBOXED_EXECUTION',
        checker: 'EXACT_BYTES',
      },
      new Date('2026-09-01T00:00:05.000Z'),
    );
    expect(result).toMatchObject({
      reason: 'SCHEDULED',
      node: { nodeId: 'node-a' },
    });
  });

  it('fails closed with a truthful no-eligible reason', () => {
    expect(
      scheduleJudgeNode(
        [node({ lastHeartbeatAt: '2026-08-31T23:00:00.000Z' })],
        {
          languageProfile: 'cpp20-gcc-13-v1',
          executionMode: 'REAL_SANDBOXED_EXECUTION',
        },
        new Date('2026-09-01T00:00:00.000Z'),
      ),
    ).toEqual({ node: undefined, reason: 'NO_COMPATIBLE_JUDGE_NODE' });
  });
});

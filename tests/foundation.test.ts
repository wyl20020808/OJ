import { describe, expect, it } from 'vitest';
import { identity } from '../packages/test-utils/src/index.js';
import { pluginSdkVersion } from '../packages/plugin-sdk/src/index.js';
import { judgeProtocolVersion } from '../packages/judge-protocol/src/index.js';

describe('foundation package boundaries', () => {
  it('preserves values through the deterministic test helper', () => {
    expect(identity({ value: 42 })).toEqual({ value: 42 });
  });

  it('exposes draft public contract markers without runtime integration', () => {
    expect(pluginSdkVersion).toBe('0.1-draft');
    expect(judgeProtocolVersion).toBe('draft');
  });
});

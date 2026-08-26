import type { PluginContext } from '@ojplatform/plugin-sdk';

export const allowedPlugin = (context: PluginContext): string =>
  context.sdkVersion;

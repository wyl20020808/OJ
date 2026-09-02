import {
  LocalJudgeHostAgent,
  buildJudgeHostAgentServer,
  type JudgeNodeTemplate,
} from './index.js';

const token = process.env.JUDGE_HOST_AGENT_TOKEN;
if (!token || token.length < 16)
  throw new Error('JUDGE_HOST_AGENT_TOKEN must be at least 16 characters');
let templates: JudgeNodeTemplate[] = [];
const raw = process.env.JUDGE_HOST_AGENT_TEMPLATES_JSON;
if (raw) {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed))
    throw new Error('JUDGE_HOST_AGENT_TEMPLATES_JSON must be an array');
  templates = parsed as JudgeNodeTemplate[];
}
const agent = new LocalJudgeHostAgent(
  templates,
  {
    configuredCpuUnits: Number(process.env.JUDGE_HOST_CPU_UNITS ?? 1),
    availableCpuUnits: Number(process.env.JUDGE_HOST_CPU_UNITS ?? 1),
    configuredMemoryMb: Number(process.env.JUDGE_HOST_MEMORY_MB ?? 1024),
    availableMemoryMb: Number(process.env.JUDGE_HOST_MEMORY_MB ?? 1024),
  },
  {
    statePath:
      process.env.JUDGE_HOST_AGENT_STATE_PATH ?? '.judge-host-agent-state.json',
  },
);
const app = await buildJudgeHostAgentServer(agent, token);
await app.listen({
  host: process.env.JUDGE_HOST_AGENT_HOST ?? '127.0.0.1',
  port: Number(process.env.JUDGE_HOST_AGENT_PORT ?? 3180),
});

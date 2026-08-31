import type { Problem } from '../services/api.js';

export const staticAnnouncements = [
  {
    id: 'web-v3',
    title: 'Web V3 中文体验上线',
    date: '2026-08-31',
    importance: '重要',
    text: '首页、题库与提交工作流已更新为简体中文界面。',
    href: '/',
  },
  {
    id: 'truthful-status',
    title: '评测状态保持原始事实',
    date: '2026-08-31',
    importance: '说明',
    text: '在 Verdict Engine 接入前，页面不会把基础设施状态解释为 AC/WA。',
    href: '/submissions',
  },
] as const;

const fortuneStates = [
  '手感正热',
  '适合复盘',
  '灵感慢热',
  '边界敏感',
  '调试幸运',
];
const fortuneAdvice = [
  '写一个最小样例',
  '画图确认状态转移',
  '先过暴力解',
  '检查整数范围',
  '复盘一道错题',
];
const fortuneAvoid = [
  '跳过边界',
  '猜复杂度',
  '复制模板不检查',
  '忘记初始化',
  '把样例当证明',
];
const fortuneAlgorithms = [
  'BFS',
  'DFS',
  'DP',
  '二分',
  '贪心',
  '前缀和',
  '并查集',
];
const fortuneComplexities = ['O(n)', 'O(n log n)', 'O(n + m)', 'O(n²)'];

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function getDailyFortune(date = new Date(), seed = 'anonymous') {
  const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const value = hash(`${seed}:${day}`);
  const pick = <T>(items: readonly T[], offset: number) =>
    items[(value + offset) % items.length];
  return {
    state: pick(fortuneStates, 0),
    should: pick(fortuneAdvice, 1),
    avoid: pick(fortuneAvoid, 2),
    algorithm: pick(fortuneAlgorithms, 3),
    complexity: pick(fortuneComplexities, 4),
    day,
  };
}

export function chooseDailyProblem(problems: Problem[], date = new Date()) {
  if (!problems.length) return null;
  const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return problems[hash(day) % problems.length];
}

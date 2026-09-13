import type {
  Problem,
  ProblemDifficulty,
  ProblemProvider,
} from '../../services/api.js';

export const problemDifficultyOptions: Array<{
  value: ProblemDifficulty;
  label: string;
}> = [
  { value: '入门', label: '入门' },
  { value: '简单', label: '普及' },
  { value: '中等', label: '提高' },
  { value: '困难', label: '省选' },
  { value: '专家', label: 'NOI' },
];

export const problemProviderOptions: Array<{
  value: ProblemProvider;
  label: string;
}> = [
  { value: 'LUOGU', label: '洛谷' },
  { value: 'CODEFORCES', label: 'Codeforces' },
  { value: 'ATCODER', label: 'AtCoder' },
  { value: 'LEETCODE', label: 'LeetCode' },
  { value: 'ACWING', label: 'AcWing' },
  { value: 'SPOJ', label: 'SPOJ' },
  { value: 'OTHER', label: '其他' },
];

export const problemCategoryOptions = [
  { value: '', label: '全部题目', tagCategories: [] },
  { value: 'foundation', label: '基础入门', tagCategories: ['基础算法'] },
  {
    value: 'data-structure',
    label: '数据结构',
    tagCategories: ['数据结构', '树'],
  },
  {
    value: 'dynamic-programming',
    label: '动态规划',
    tagCategories: ['动态规划'],
  },
  { value: 'graph', label: '图论', tagCategories: ['图论'] },
  { value: 'string', label: '字符串', tagCategories: ['字符串'] },
  {
    value: 'math',
    label: '数学',
    tagCategories: ['数学', '计算几何'],
  },
  { value: 'other', label: '其他', tagCategories: [] },
] as const;

const primaryTagCategories = new Set<string>(
  problemCategoryOptions.flatMap((category) => category.tagCategories),
);

export function problemCategoryTagIds(
  category: string,
  tags: NonNullable<Problem['tagDetails']>,
) {
  if (!category) return [];
  const definition = problemCategoryOptions.find(
    (option) => option.value === category,
  );
  if (!definition) return [];
  return tags
    .filter((tag) =>
      definition.value === 'other'
        ? !primaryTagCategories.has(tag.category)
        : definition.tagCategories.some((name) => name === tag.category),
    )
    .map((tag) => tag.id);
}

export function problemDifficultyLabel(
  difficulty: ProblemDifficulty | null | undefined,
) {
  return (
    problemDifficultyOptions.find((option) => option.value === difficulty)
      ?.label ?? '未提供'
  );
}

export function problemProviderLabel(
  provider: ProblemProvider | null | undefined,
) {
  return (
    problemProviderOptions.find((option) => option.value === provider)?.label ??
    '其他'
  );
}

export function problemDisplayId(problem: Problem) {
  return problem.providerProblemId || problem.publicId || '编号不可用';
}

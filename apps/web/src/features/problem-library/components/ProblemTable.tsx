import type { MouseEvent } from 'react';
import type { Problem } from '../../../services/api.js';
import { ProblemLibraryIcon as Icon } from './ProblemLibraryIcon.js';

const sourceLabels = {
  CREATOR: '平台创建',
  EXTERNAL: '外部题源',
  IMPORT: '导入题目',
  TEST_FIXTURE: '测试数据',
  API_AUTOMATION: 'API 自动创建',
} as const;

export function ProblemTable({
  items,
  loading,
  navigate,
}: {
  items: Problem[];
  loading: boolean;
  navigate: (path: string) => void;
}) {
  return (
    <div
      className={`problem-table problem-list-modern${loading ? ' is-loading' : ''}`}
      role="list"
      aria-label="题目列表"
    >
      <div className="problem-table-header" aria-hidden="true">
        <span>#</span>
        <span>题目标题</span>
        <span>难度</span>
        <span>标签</span>
        <span>来源</span>
        <span>通过率</span>
        <span>提交数</span>
        <span>收藏</span>
        <span>操作</span>
      </div>
      {items.map((problem) => {
        const tags =
          problem.tagDetails?.map((item) => item.name) ?? problem.tags ?? [];
        const statistics = problem.statistics ?? {
          submissionCount: 0,
          acceptedCount: 0,
        };
        const acceptanceRate = statistics.submissionCount
          ? `${Math.round((statistics.acceptedCount / statistics.submissionCount) * 100)}%`
          : '暂无记录';
        const path = `/problems/${problem.slug || problem.id}`;
        return (
          <div key={problem.id} role="listitem">
            <a
              href={path}
              className="problem-row"
              aria-label={`${problem.publicId ?? '编号不可用'} ${problem.title}`}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                event.preventDefault();
                navigate(path);
              }}
            >
              <span className="problem-id">
                {problem.publicId ?? '编号不可用'}
              </span>
              <span className="problem-title" title={problem.title}>
                {problem.title}
              </span>
              <span
                className={`problem-difficulty-chip difficulty-${problem.difficulty ?? 'unknown'}`}
              >
                {problem.difficulty ?? '未提供'}
              </span>
              <span className="tag-row" aria-label="题目标签">
                {tags.length ? (
                  tags.slice(0, 2).map((tag) => (
                    <span key={tag} title={tag}>
                      {tag}
                    </span>
                  ))
                ) : (
                  <span>暂无标签</span>
                )}
              </span>
              <span className="problem-source">
                {problem.sourceType ? sourceLabels[problem.sourceType] : '—'}
              </span>
              <span className="problem-rate" title="当前判题结果聚合">
                {acceptanceRate}
              </span>
              <span className="problem-submissions" title="当前提交记录总数">
                {statistics.submissionCount.toLocaleString('zh-CN')}
              </span>
              <span className="problem-star" aria-label="收藏功能未开放">
                <Icon name="bookmark" />
              </span>
              <span className="problem-action">练习</span>
            </a>
          </div>
        );
      })}
    </div>
  );
}

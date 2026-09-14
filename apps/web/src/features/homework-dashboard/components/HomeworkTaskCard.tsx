import type { HomeworkTask, OverdueHomeworkTask } from '../types.js';
import { HomeworkIcon } from './HomeworkIcon.js';

export function HomeworkTaskCard({
  task,
  navigate,
}: {
  task: HomeworkTask;
  navigate: (path: string) => void;
}) {
  return (
    <article className="homework-task-card">
      <header>
        <span className="homework-task-card__icon">
          <HomeworkIcon name="document" />
        </span>
        <span>第 {String(task.lesson).padStart(2, '0')} 课</span>
        <strong>{task.deadlineLabel}</strong>
      </header>
      <h3>
        {task.problemId} {task.title}
      </h3>
      <div className="homework-tags">
        {task.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <footer>
        <span>
          <HomeworkIcon name="calendar" />
          {task.dueAt}
        </span>
        <button
          type="button"
          onClick={() => navigate(`/problems/${task.problemId}`)}
        >
          去做题 <span aria-hidden="true">→</span>
        </button>
      </footer>
    </article>
  );
}

export function OverdueTaskCard({
  task,
  navigate,
}: {
  task: OverdueHomeworkTask;
  navigate: (path: string) => void;
}) {
  return (
    <article className="homework-overdue-card">
      <header>
        <span className="homework-task-card__icon">
          <HomeworkIcon name="document" />
        </span>
        <span>第 {String(task.lesson).padStart(2, '0')} 课</span>
        <strong>
          <HomeworkIcon name="alert" />
          {task.overdueLabel}
        </strong>
      </header>
      <div className="homework-overdue-card__body">
        <h3>
          {task.problemId} {task.title}
        </h3>
        <div className="homework-tags">
          {task.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <footer>
        <span>
          <HomeworkIcon name="calendar" />
          {task.dueAt} <b>（{task.deadlineLabel}）</b>
        </span>
        <button
          type="button"
          onClick={() => navigate(`/problems/${task.problemId}`)}
        >
          {task.actionLabel} <span aria-hidden="true">→</span>
        </button>
      </footer>
    </article>
  );
}

import type { DeadlineReminder } from '../types.js';
import { HomeworkIcon } from './HomeworkIcon.js';

export function ProgressNudge() {
  return (
    <section className="homework-progress-nudge">
      <span>
        <HomeworkIcon name="flag" />
      </span>
      <div>
        <h2>坚持就是进步！</h2>
        <p>还有 16 个课次，继续加油！</p>
      </div>
    </section>
  );
}

export function DeadlineReminders({
  reminders,
}: {
  reminders: DeadlineReminder[];
}) {
  return (
    <section className="homework-reminders">
      <header>
        <h2>
          <span>
            <HomeworkIcon name="bell" />
          </span>
          近期截止提醒
        </h2>
        <button type="button">
          查看全部 <HomeworkIcon name="chevron" />
        </button>
      </header>
      <ul>
        {reminders.map((item) => (
          <li key={`${item.problemId}-${item.dueAt}`}>
            <i className={`is-${item.tone}`} />
            <div>
              <h3>
                {item.problemId} {item.title}
              </h3>
              <p>
                <span>第 {String(item.lesson).padStart(2, '0')} 课</span>
                <span>{item.dueAt}</span>
              </p>
            </div>
            <strong className={`is-${item.tone}`}>{item.timing}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MotivationQuote() {
  return (
    <section className="homework-motivation-quote">
      <span aria-hidden="true">“</span>
      <blockquote>
        不负今日，
        <br />
        成就更好的自己！
      </blockquote>
      <HomeworkIcon name="flag" />
    </section>
  );
}

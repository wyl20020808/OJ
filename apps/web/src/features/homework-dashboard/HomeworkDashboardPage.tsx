import { CourseSidebar } from './components/CourseSidebar.js';
import { HomeworkOverview } from './components/HomeworkOverview.js';
import {
  DeadlineReminders,
  MotivationQuote,
  ProgressNudge,
} from './components/HomeworkSidebar.js';
import {
  HomeworkTaskCard,
  OverdueTaskCard,
} from './components/HomeworkTaskCard.js';
import { MotivationBanner } from './components/MotivationBanner.js';
import { homeworkDashboardFixture } from './homeworkDashboardFixture.js';
import { HomeworkIcon } from './components/HomeworkIcon.js';
import './HomeworkDashboardPage.css';

type Navigate = (path: string) => void;

function SectionHeading({
  title,
  icon,
  count,
}: {
  title: string;
  icon: 'document' | 'bell';
  count?: number;
}) {
  return (
    <header className="homework-section-heading">
      <h2>
        <span>
          <HomeworkIcon name={icon} />
        </span>
        {title}
      </h2>
      <div>
        {count !== undefined && <span>共 {count} 项</span>}
        <button type="button">
          查看全部 <HomeworkIcon name="chevron" />
        </button>
      </div>
    </header>
  );
}

export function HomeworkDashboardPage({ navigate }: { navigate: Navigate }) {
  const fixture = homeworkDashboardFixture;

  return (
    <div className="homework-dashboard">
      <CourseSidebar course={fixture} />

      <main className="homework-dashboard__main">
        <MotivationBanner />
        <section className="homework-priority-section">
          <SectionHeading
            title="当前需要优先完成（本周作业）"
            icon="document"
            count={fixture.priorityTasks.length}
          />
          <div className="homework-priority-grid">
            {fixture.priorityTasks.map((task) => (
              <HomeworkTaskCard
                key={task.problemId}
                task={task}
                navigate={navigate}
              />
            ))}
          </div>
        </section>

        <section className="homework-overdue-section">
          <SectionHeading title="拖欠作业" icon="bell" />
          <div className="homework-overdue-grid">
            {fixture.overdueTasks.map((task) => (
              <OverdueTaskCard
                key={`${task.problemId}-${task.lesson}`}
                task={task}
                navigate={navigate}
              />
            ))}
          </div>
        </section>
      </main>

      <aside className="homework-dashboard__aside">
        <HomeworkOverview />
        <ProgressNudge />
        <DeadlineReminders reminders={fixture.reminders} />
        <MotivationQuote />
      </aside>
    </div>
  );
}

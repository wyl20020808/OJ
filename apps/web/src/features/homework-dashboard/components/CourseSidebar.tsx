import type { HomeworkDashboardFixture } from '../types.js';
import { HomeworkIcon } from './HomeworkIcon.js';

export function CourseSidebar({
  course,
}: {
  course: HomeworkDashboardFixture;
}) {
  const progress =
    Math.round((course.completedLessons / course.courseCount) * 1000) / 10;

  return (
    <aside className="homework-course-card" aria-label="课程进度导航">
      <h2>当前课程</h2>
      <button className="homework-course-select" type="button">
        <span className="homework-course-select__icon">
          <HomeworkIcon name="book" />
        </span>
        <strong>
          {course.courseTitle}（{course.courseCount} 讲）
        </strong>
        <span className="homework-course-select__arrow" aria-hidden="true">
          ⌄
        </span>
      </button>

      <div className="homework-course-progress">
        <div>
          <strong>整体进度</strong>
          <strong>{progress}%</strong>
        </div>
        <div
          className="homework-progress-track"
          aria-label={`课程进度 ${progress}%`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>
          {course.completedLessons} / {course.courseCount} 节已完成
        </p>
      </div>

      <ol className="homework-lesson-list">
        {course.lessons.map((lesson) => (
          <li
            className={`homework-lesson homework-lesson--${lesson.state}`}
            key={lesson.number}
          >
            <span className="homework-lesson__status">
              {lesson.state === 'completed' ? '✓' : ''}
            </span>
            <span className="homework-lesson__number">
              第 {String(lesson.number).padStart(2, '0')} 课
            </span>
            <span className="homework-lesson__title">{lesson.title}</span>
            <span className="homework-lesson__count">
              {lesson.completed}/{lesson.total}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

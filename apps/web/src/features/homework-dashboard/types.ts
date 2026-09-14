export type CourseLesson = {
  number: number;
  title: string;
  completed: number;
  total: number;
  state: 'completed' | 'current' | 'pending';
};

export type HomeworkTask = {
  lesson: number;
  problemId: string;
  title: string;
  tags: string[];
  dueAt: string;
  deadlineLabel: string;
};

export type OverdueHomeworkTask = HomeworkTask & {
  overdueLabel: string;
  actionLabel: string;
};

export type DeadlineReminder = {
  lesson: number;
  problemId: string;
  title: string;
  dueAt: string;
  timing: string;
  tone: 'danger' | 'warning' | 'info';
};

export type HomeworkDashboardFixture = {
  courseTitle: string;
  courseCount: number;
  completedLessons: number;
  lessons: CourseLesson[];
  priorityTasks: HomeworkTask[];
  overdueTasks: OverdueHomeworkTask[];
  reminders: DeadlineReminder[];
};

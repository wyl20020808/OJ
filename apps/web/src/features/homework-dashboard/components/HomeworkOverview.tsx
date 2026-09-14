import { HomeworkIcon } from './HomeworkIcon.js';

const legend = [
  { label: '已完成', value: 8, percent: '33.3%', className: 'complete' },
  { label: '进行中', value: 3, percent: '12.5%', className: 'active' },
  { label: '未开始', value: 11, percent: '45.8%', className: 'pending' },
  { label: '已拖欠', value: 2, percent: '8.3%', className: 'overdue' },
];

export function HomeworkOverview() {
  return (
    <section className="homework-overview">
      <header>
        <h2>
          <span className="homework-overview__icon">
            <HomeworkIcon name="chart" />
          </span>
          全部作业总览
        </h2>
        <button type="button">
          全部课程 <span aria-hidden="true">⌄</span>
        </button>
      </header>
      <div className="homework-overview__body">
        <div className="homework-donut" aria-label="24 项作业中已完成 8 项">
          <div>
            <strong>
              8<small>/24</small>
            </strong>
            <span>已完成</span>
          </div>
        </div>
        <ul>
          {legend.map((item) => (
            <li key={item.label}>
              <i className={`is-${item.className}`} />
              <strong>{item.label}</strong>
              <span>{item.value}</span>
              <b>{item.percent}</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

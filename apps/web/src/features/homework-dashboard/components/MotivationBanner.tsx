import { HomeworkIcon } from './HomeworkIcon.js';

function BannerMetric({
  icon,
  title,
  value,
  suffix,
  description,
  danger = false,
}: {
  icon: 'clock' | 'alert';
  title: string;
  value: string;
  suffix: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div className={`homework-banner-metric${danger ? ' is-danger' : ''}`}>
      <span className="homework-banner-metric__icon">
        <HomeworkIcon name={icon} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>
          <b>{value}</b> {suffix}
        </p>
        <small>{description}</small>
      </div>
    </div>
  );
}

export function MotivationBanner() {
  return (
    <section className="homework-banner">
      <div className="homework-banner__calendar" aria-hidden="true">
        <span />
        <i />
        <i />
        <b />
        <b />
      </div>
      <div className="homework-banner__copy">
        <h1>继续加油！</h1>
        <p>按时完成每一次作业，更重要的成长。</p>
      </div>
      <div className="homework-banner__metrics">
        <BannerMetric
          icon="clock"
          title="本周待做"
          value="4"
          suffix="项"
          description="抓住本周的完成"
        />
        <BannerMetric
          icon="alert"
          title="拖欠作业"
          value="2"
          suffix="项"
          description="尽快补交，避免影响成绩"
          danger
        />
      </div>
    </section>
  );
}

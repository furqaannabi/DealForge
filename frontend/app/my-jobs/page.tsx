import { MyJobsMonitor } from '@/components/my-jobs-monitor';

export default function MyJobsPage() {
  return (
    <div className="page">
      <section className="panel page-head fade-in">
        <p className="eyebrow">My Jobs</p>
        <h1>Track jobs posted by the task agent</h1>
        <p className="lead">Watch incoming proposals for each posted job and accept them without going back to the terminal.</p>
      </section>

      <MyJobsMonitor />
    </div>
  );
}

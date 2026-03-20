import { TasksMonitor } from '@/components/tasks-monitor';

export default function TasksPage() {
  return (
    <div className="page">
      <section className="panel page-head fade-in">
        <p className="eyebrow">Tasks</p>
        <h1>Browse available tasks</h1>
        <p className="lead">See every open task on the board, along with budget, deadline, and current status.</p>
      </section>

      <TasksMonitor />
    </div>
  );
}

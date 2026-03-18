import { DealsMonitor } from '@/components/deals-monitor';

export default function DealsPage() {
  return (
    <div className="page">
      <section className="panel page-head fade-in">
        <p className="eyebrow">Deals</p>
        <h1>Track your active work</h1>
        <p className="lead">See what is in progress, what is funded, and what is ready to close.</p>
      </section>

      <DealsMonitor />
    </div>
  );
}

import { DealsMonitor } from '@/components/deals-monitor';

export default function DealsPage() {
  return (
    <div className="page">
      <section className="panel page-head fade-in">
        <p className="eyebrow">Deals Monitor</p>
        <h1>Escrow and execution</h1>
        <p className="lead">Compact live view of state, progress, and settlement flow.</p>
      </section>

      <DealsMonitor />
    </div>
  );
}

import { deals, formatTxHash } from '@/lib/mock-data';

export default function DealsPage() {
  return (
    <div className="page">
      <section className="panel page-head fade-in">
        <p className="eyebrow">Deals Monitor</p>
        <h1>Escrow and execution</h1>
        <p className="lead">Track each deal through negotiation, escrow, execution, result submission, and settlement.</p>
      </section>

      <section className="deal-summary slide-up">
        <article className="panel summary-tile">
          <span>Live</span>
          <strong>2</strong>
          <p>Executing or awaiting result submission</p>
        </article>
        <article className="panel summary-tile">
          <span>Escrow locked</span>
          <strong>6.5 USDC</strong>
          <p>Across current worker agreements</p>
        </article>
        <article className="panel summary-tile">
          <span>Finalized</span>
          <strong>1</strong>
          <p>Ready for archive and reporting</p>
        </article>
      </section>

      <section className="deal-grid slide-up">
        {deals.map((deal) => (
          <article key={deal.id} className="panel deal-card-minimal">
            <div className="section-head">
              <div>
                <p className="eyebrow">Deal #{deal.id}</p>
                <h2>{deal.worker}</h2>
              </div>
              <span className="pill">{deal.status}</span>
            </div>

            <p className="deal-description">{deal.task}</p>

            <div className="meta-grid">
              <div className="meta-item">
                <span>Escrow</span>
                <strong>{deal.escrow}</strong>
              </div>
              <div className="meta-item">
                <span>Deadline</span>
                <strong>{deal.deadline}</strong>
              </div>
              <div className="meta-item">
                <span>Confirmation</span>
                <strong>{deal.confirmation}</strong>
              </div>
              <div className="meta-item">
                <span>Transaction</span>
                <a href={`https://basescan.org/tx/${deal.txHash}`} target="_blank" rel="noreferrer">
                  {formatTxHash(deal.txHash)}
                </a>
              </div>
            </div>

            <div className="progress-head">
              <span>Lifecycle progress</span>
              <strong>{deal.progress}%</strong>
            </div>

            <div className="progress-track compact">
              <div className="progress-fill" style={{ width: `${deal.progress}%` }} />
            </div>

            <div className="timeline-minimal">
              {deal.timeline.map((step) => (
                <div key={`${deal.id}-${step.label}`} className={step.complete ? 'timeline-item complete' : 'timeline-item'}>
                  <span className="timeline-bullet" />
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

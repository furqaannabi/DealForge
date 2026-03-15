import { DashboardOverview } from '@/components/dashboard-overview';

export default function Home() {
  return (
    <div className="page">
      <section className="panel hero fade-in">
        <div className="hero-copy">
          <p className="eyebrow">Autonomous Agent-to-Agent Deal Protocol</p>
          <h1>DealForge dashboard</h1>
          <p className="lead">
            A minimal command center for posting jobs, monitoring live negotiations, and tracking escrow
            execution on Base.
          </p>
        </div>
        <div className="hero-actions">
          <a className="button button-primary" href="/post-job">
            Open terminal
          </a>
          <a className="button" href="/deals">
            View deals
          </a>
        </div>
      </section>

      <DashboardOverview />

      <section className="dashboard-grid">
        <article className="panel section-card fade-in">
          <div className="section-head">
            <div>
              <p className="eyebrow">Overview</p>
              <h2>Protocol status</h2>
            </div>
            <span className="pill">Base synced</span>
          </div>
          <div className="detail-list">
            <div className="detail-row">
              <span>Task agent</span>
              <strong>task.agent.eth</strong>
            </div>
            <div className="detail-row">
              <span>Wallet</span>
              <strong>0x4A2...91bE</strong>
            </div>
            <div className="detail-row">
              <span>Relay status</span>
              <strong>online / 42ms</strong>
            </div>
            <div className="detail-row">
              <span>IPFS pinning</span>
              <strong>healthy</strong>
            </div>
          </div>
        </article>

        <article className="panel section-card fade-in">
          <div className="section-head">
            <div>
              <p className="eyebrow">Live snapshot</p>
              <h2>Recent activity</h2>
            </div>
          </div>
          <div className="terminal-preview">
            <p>[12:02:11] worker.summarizer.eth proposes 3 USDC / 20 min</p>
            <p>[12:02:14] task agent counters 2.5 USDC</p>
            <p>[12:02:16] agreement reached</p>
            <p>[12:02:21] escrow created on Base</p>
            <p>[12:03:02] worker executing task</p>
          </div>
        </article>

        <article className="panel section-card fade-in">
          <div className="section-head">
            <div>
              <p className="eyebrow">Quick access</p>
              <h2>Focused workflows</h2>
            </div>
          </div>
          <div className="link-stack">
            <a className="simple-link" href="/post-job">
              Post a new job from terminal
            </a>
            <a className="simple-link" href="/deals">
              Inspect deal lifecycle and escrow
            </a>
          </div>
        </article>
      </section>
    </div>
  );
}

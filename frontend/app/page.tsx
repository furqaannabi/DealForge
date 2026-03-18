import { DashboardOverview } from '@/components/dashboard-overview';

export default function Home() {
  return (
    <div className="page">
      <section className="panel hero fade-in">
        <div className="hero-copy">
          <p className="eyebrow">Autonomous Agent-to-Agent Deal Protocol</p>
          <h1>Operate deals, not dashboards.</h1>
          <p className="lead">Clean command surfaces for jobs, execution, and escrow on Base.</p>
        </div>

        <div className="hero-rail">
          <div className="hero-orbital">
            <span />
            <span />
            <span />
          </div>

          <div className="hero-actions">
            <a className="button button-primary" href="/post-job">
              Open terminal
            </a>
            <a className="button" href="/deals">
              View deals
            </a>
          </div>
        </div>
      </section>

      <DashboardOverview />

      <section className="panel split-board fade-in">
        <div className="board-col">
          <p className="eyebrow">Runtime</p>
          <h2>Live state</h2>
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
              <span>Relay</span>
              <strong>online / 42ms</strong>
            </div>
            <div className="detail-row">
              <span>IPFS</span>
              <strong>healthy</strong>
            </div>
          </div>
        </div>

        <div className="board-col board-col-wide">
          <p className="eyebrow">Trace</p>
          <h2>Recent activity</h2>
          <div className="activity-lines">
            <p><span>12:02:11</span> worker.summarizer.eth proposes 3 USDC / 20 min</p>
            <p><span>12:02:14</span> task agent counters 2.5 USDC</p>
            <p><span>12:02:16</span> agreement reached</p>
            <p><span>12:02:21</span> escrow created on Base</p>
            <p><span>12:03:02</span> worker executing task</p>
          </div>
        </div>

        <div className="board-col">
          <p className="eyebrow">Jump</p>
          <h2>Next action</h2>
          <div className="jump-links">
            <a className="simple-link" href="/post-job">
              Post a job
            </a>
            <a className="simple-link" href="/deals">
              Inspect deals
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

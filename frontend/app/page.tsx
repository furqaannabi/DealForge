import { DashboardOverview } from '@/components/dashboard-overview';
import { DashboardActivity } from '@/components/dashboard-activity';
import { AgentSkillCard } from '@/components/agent-skill-card';

export default function Home() {
  return (
    <div className="page">
      <section className="panel hero fade-in">
        <div className="hero-copy">
          <p className="eyebrow">Agent-powered task workspace</p>
          <h1>Get work done with trusted AI agents.</h1>
          <p className="lead">Create tasks, follow progress, and manage payments from one place.</p>
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

      <DashboardActivity />

      <AgentSkillCard />
    </div>
  );
}

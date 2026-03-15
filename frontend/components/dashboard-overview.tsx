'use client';

import { useEffect, useState } from 'react';
import { listAgents } from '@/lib/api/agents';
import { listJobs } from '@/lib/api/jobs';
import { API_BASE_URL } from '@/lib/config';

type DashboardState = {
  jobs: number;
  agents: number;
  lockedJobs: number;
  apiOnline: boolean;
};

const initialState: DashboardState = {
  jobs: 12,
  agents: 28,
  lockedJobs: 3,
  apiOnline: false,
};

export function DashboardOverview() {
  const [state, setState] = useState<DashboardState>(initialState);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [jobsResponse, agentsResponse] = await Promise.all([listJobs(), listAgents()]);
        if (!active) {
          return;
        }

        setState({
          jobs: jobsResponse.total,
          agents: agentsResponse.agents.length,
          lockedJobs: jobsResponse.jobs.filter((job) => job.status === 'locked').length,
          apiOnline: true,
        });
      } catch {
        if (active) {
          setState((current) => ({ ...current, apiOnline: false }));
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <section className="stats-grid slide-up">
        <article className="panel stat-card">
          <p className="label">Jobs indexed</p>
          <strong>{state.jobs}</strong>
          <span>{state.apiOnline ? 'Live from coordination API' : 'Fallback snapshot while API is offline'}</span>
        </article>
        <article className="panel stat-card">
          <p className="label">Agents registered</p>
          <strong>{state.agents}</strong>
          <span>Worker agents available for matching and negotiation</span>
        </article>
        <article className="panel stat-card">
          <p className="label">Locked jobs</p>
          <strong>{state.lockedJobs}</strong>
          <span>Jobs currently committed beyond negotiation</span>
        </article>
      </section>

      <article className="panel section-card fade-in">
        <div className="section-head">
          <div>
            <p className="eyebrow">Integration</p>
            <h2>Frontend API wiring</h2>
          </div>
          <span className={state.apiOnline ? 'pill pill-status settled' : 'pill'}>{state.apiOnline ? 'Live API' : 'Fallback mode'}</span>
        </div>
        <div className="detail-list">
          <div className="detail-row">
            <span>API base URL</span>
            <strong>{API_BASE_URL}</strong>
          </div>
          <div className="detail-row">
            <span>Dashboard source</span>
            <strong>{state.apiOnline ? 'REST endpoints' : 'Local mock backup'}</strong>
          </div>
        </div>
      </article>
    </>
  );
}

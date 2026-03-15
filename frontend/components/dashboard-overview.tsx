'use client';

import { useEffect, useState } from 'react';
import { listAgents } from '@/lib/api/agents';
import { listJobs } from '@/lib/api/jobs';
import { getHealth } from '@/lib/api/system';
import { API_BASE_URL } from '@/lib/config';

type DashboardState = {
  jobs: number;
  agents: number;
  lockedJobs: number;
  apiOnline: boolean;
  version: string;
};

const initialState: DashboardState = {
  jobs: 12,
  agents: 28,
  lockedJobs: 3,
  apiOnline: false,
  version: 'offline',
};

export function DashboardOverview() {
  const [state, setState] = useState<DashboardState>(initialState);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [healthResponse, jobsResponse, agentsResponse] = await Promise.all([getHealth(), listJobs('open'), listAgents()]);
        if (!active) {
          return;
        }

        setState({
          jobs: jobsResponse.total,
          agents: agentsResponse.agents.length,
          lockedJobs: jobsResponse.jobs.filter((job) => job.status === 'locked').length,
          apiOnline: healthResponse.status === 'ok',
          version: healthResponse.version,
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
          <p className="label">Open jobs</p>
          <strong>{state.jobs}</strong>
          <span>{state.apiOnline ? 'Live from GET /jobs?status=open' : 'Fallback snapshot while API is offline'}</span>
        </article>
        <article className="panel stat-card">
          <p className="label">Agents registered</p>
          <strong>{state.agents}</strong>
          <span>Loaded from the documented GET /agents registry endpoint</span>
        </article>
        <article className="panel stat-card">
          <p className="label">Locked jobs</p>
          <strong>{state.lockedJobs}</strong>
          <span>Mirrored from coordination API job status values</span>
        </article>
      </section>

      <article className="panel section-card fade-in">
        <div className="section-head">
          <div>
            <p className="eyebrow">Integration</p>
            <h2>API contract</h2>
          </div>
          <span className={state.apiOnline ? 'pill pill-status settled' : 'pill'}>
            {state.apiOnline ? 'Health OK' : 'Offline'}
          </span>
        </div>
        <div className="detail-list">
          <div className="detail-row">
            <span>Base URL</span>
            <strong>{API_BASE_URL}</strong>
          </div>
          <div className="detail-row">
            <span>Health endpoint</span>
            <strong>/health</strong>
          </div>
          <div className="detail-row">
            <span>API version</span>
            <strong>{state.version}</strong>
          </div>
          <div className="detail-row">
            <span>Write auth model</span>
            <strong>x-agent-address header</strong>
          </div>
        </div>
      </article>
    </>
  );
}

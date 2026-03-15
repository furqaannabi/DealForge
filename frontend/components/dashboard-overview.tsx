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

      
    </>
  );
}

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
        const [healthResponse, jobsResponse, agentsResponse] = await Promise.all([
          getHealth(),
          listJobs('open'),
          listAgents(),
        ]);

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
    <section className="panel metrics-band slide-up">
      <div className="metrics-inline">
        <div className="metric-chip">
          <span>Open tasks</span>
          <strong>{state.jobs}</strong>
        </div>
        <div className="metric-chip">
          <span>Available agents</span>
          <strong>{state.agents}</strong>
        </div>
        <div className="metric-chip">
          <span>In progress</span>
          <strong>{state.lockedJobs}</strong>
        </div>
      </div>

      <div className="integration-strip">
        <span>{state.apiOnline ? 'Live data' : 'Preview data'}</span>
        <span>{API_BASE_URL}</span>
        <span>Version {state.version}</span>
        <span>Secure agent access</span>
      </div>
    </section>
  );
}

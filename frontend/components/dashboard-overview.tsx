'use client';

import { useEffect, useState } from 'react';
import { listDeals } from '@/lib/api/deals';
import { listAgents } from '@/lib/api/agents';
import { listJobs } from '@/lib/api/jobs';
import { getHealth } from '@/lib/api/system';
import { API_BASE_URL } from '@/lib/config';

type DashboardState = {
  jobs: number | null;
  agents: number | null;
  runningJobs: number | null;
  inProgressDeals: number | null;
  apiOnline: boolean;
  version: string;
};

const initialState: DashboardState = {
  jobs: null,
  agents: null,
  runningJobs: null,
  inProgressDeals: null,
  apiOnline: false,
  version: 'loading',
};

export function DashboardOverview() {
  const [state, setState] = useState<DashboardState>(initialState);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [healthResponse, jobsResponse, agentsResponse, dealsResponse] = await Promise.all([
          getHealth(),
          listJobs({ status: 'open' }),
          listAgents(),
          listDeals({ limit: 50 }),
        ]);

        if (!active) {
          return;
        }

        const runningJobs = jobsResponse.jobs.filter((job) => job.status === 'locked' || job.status === 'negotiating').length;
        const inProgressDeals = dealsResponse.deals.filter(
          (deal) => deal.status === 'CREATED' || deal.status === 'ACTIVE' || deal.status === 'SUBMITTED',
        ).length;

        setState({
          jobs: jobsResponse.total,
          agents: agentsResponse.agents.length,
          runningJobs,
          inProgressDeals,
          apiOnline: healthResponse.status === 'ok',
          version: healthResponse.version,
        });
        setIsLoading(false);
      } catch {
        if (active) {
          setState((current) => ({ ...current, apiOnline: false, version: 'offline' }));
          setIsLoading(false);
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
          <strong>{isLoading ? <span className="metric-skeleton" aria-hidden="true" /> : state.jobs}</strong>
        </div>
        <div className="metric-chip">
          <span>Available agents</span>
          <strong>{isLoading ? <span className="metric-skeleton" aria-hidden="true" /> : state.agents}</strong>
        </div>
        <div className="metric-chip">
          <span>Jobs running</span>
          <strong>{isLoading ? <span className="metric-skeleton" aria-hidden="true" /> : state.runningJobs}</strong>
        </div>
        <div className="metric-chip">
          <span>In-progress deals</span>
          <strong>{isLoading ? <span className="metric-skeleton" aria-hidden="true" /> : state.inProgressDeals}</strong>
        </div>
      </div>

      <div className="integration-strip">
        <span>{isLoading ? 'Loading live data' : state.apiOnline ? 'Live data' : 'Offline data'}</span>
        <span>{API_BASE_URL}</span>
        <span>Version {state.version}</span>
        <span>Secure agent access</span>
      </div>
    </section>
  );
}

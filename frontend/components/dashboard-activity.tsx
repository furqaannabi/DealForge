'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { listDeals } from '@/lib/api/deals';
import { listJobs } from '@/lib/api/jobs';
import { getHealth } from '@/lib/api/system';
import { DEALFORGE_CHAIN_NAME } from '@/lib/config';
import type { ApiDeal, ApiJob } from '@/lib/types/api';

type ActivityItem = {
  id: string;
  timestamp: string;
  text: string;
};

type DashboardActivityState = {
  jobs: ApiJob[];
  deals: ApiDeal[];
  apiOnline: boolean;
};

function formatAddress(address?: string) {
  if (!address) {
    return 'Not connected';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTime(value?: string) {
  if (!value) {
    return '--:--:--';
  }

  return new Date(value).toLocaleTimeString();
}

function formatStatus(status: ApiDeal['status']) {
  if (status === 'CREATED') return 'deal created';
  if (status === 'ACTIVE') return 'worker executing';
  if (status === 'SUBMITTED') return 'result submitted';
  if (status === 'SETTLED') return 'deal settled';
  if (status === 'REFUNDED') return 'deal refunded';
  return 'deal disputed';
}

export function DashboardActivity() {
  const { address, isConnected } = useAccount();
  const [state, setState] = useState<DashboardActivityState>({
    jobs: [],
    deals: [],
    apiOnline: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [health, jobsResponse, dealsResponse] = await Promise.all([
          getHealth(),
          listJobs({ limit: 5 }),
          listDeals({ limit: 5 }),
        ]);

        if (!active) {
          return;
        }

        setState({
          jobs: jobsResponse.jobs,
          deals: dealsResponse.deals,
          apiOnline: health.status === 'ok',
        });
      } catch {
        if (!active) {
          return;
        }

        setState({
          jobs: [],
          deals: [],
          apiOnline: false,
        });
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const activity = useMemo(() => {
    const jobItems: ActivityItem[] = state.jobs.map((job) => ({
      id: `job-${job.id}`,
      timestamp: job.created_at ?? job.createdAt ?? '',
      text: `job ${job.id.slice(0, 6)} posted in ${job.category}`,
    }));

    const dealItems: ActivityItem[] = state.deals.map((deal) => ({
      id: `deal-${String(deal.deal_id ?? deal.dealId)}`,
      timestamp: deal.created_at ?? deal.createdAt ?? '',
      text: `deal #${String(deal.deal_id ?? deal.dealId)} ${formatStatus(deal.status)}`,
    }));

    return [...jobItems, ...dealItems]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 5);
  }, [state.deals, state.jobs]);

  const runningJobs = state.jobs.filter((job) => job.status === 'negotiating' || job.status === 'locked').length;
  const liveDeals = state.deals.filter((deal) => deal.status === 'CREATED' || deal.status === 'ACTIVE').length;

  return (
    <section className="panel split-board fade-in">
      <div className="board-col">
        <p className="eyebrow">Overview</p>
        <h2>Your workspace</h2>
        <div className="detail-list">
          <div className="detail-row">
            <span>Wallet</span>
            <strong>{formatAddress(address)}</strong>
          </div>
          <div className="detail-row">
            <span>Connection</span>
            <strong>{state.apiOnline ? 'API online' : 'API offline'}</strong>
          </div>
          <div className="detail-row">
            <span>Network</span>
            <strong>{DEALFORGE_CHAIN_NAME}</strong>
          </div>
          <div className="detail-row">
            <span>Active jobs</span>
            <strong>{isLoading ? '...' : runningJobs}</strong>
          </div>
          <div className="detail-row">
            <span>Live deals</span>
            <strong>{isLoading ? '...' : liveDeals}</strong>
          </div>
          <div className="detail-row">
            <span>Session</span>
            <strong>{isConnected ? 'Connected' : 'Disconnected'}</strong>
          </div>
        </div>
      </div>

      <div className="board-col board-col-wide">
        <p className="eyebrow">Recent updates</p>
        <h2>What happened lately</h2>
        <div className="activity-lines">
          {isLoading ? (
            <>
              <p><span>--:--:--</span> loading recent activity</p>
              <p><span>--:--:--</span> fetching jobs and deals</p>
            </>
          ) : activity.length > 0 ? (
            activity.map((item) => (
              <p key={item.id}>
                <span>{formatTime(item.timestamp)}</span> {item.text}
              </p>
            ))
          ) : (
            <p><span>--:--:--</span> no recent jobs or deals yet</p>
          )}
        </div>
      </div>

      <div className="board-col">
        <p className="eyebrow">Quick actions</p>
        <h2>Start here</h2>
        <div className="jump-links">
          <a className="simple-link" href="/post-job">
            Create a new task
          </a>
          <a className="simple-link" href="/my-jobs">
            Review your jobs
          </a>
          <a className="simple-link" href="/deals">
            View active deals
          </a>
        </div>
      </div>
    </section>
  );
}

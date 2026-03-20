'use client';

import { useEffect, useState } from 'react';
import { listJobs } from '@/lib/api/jobs';
import type { ApiJob } from '@/lib/types/api';

function formatBudget(job: ApiJob) {
  const rawBudget = job.maxBudget ?? job.max_budget;
  if (!rawBudget) {
    return 'Flexible';
  }

  try {
    const wei = BigInt(rawBudget);
    const base = BigInt('1000000000000000000');
    const whole = wei / base;
    const fraction = wei % base;
    const fractionText = fraction.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
    return `${fractionText ? `${whole.toString()}.${fractionText}` : whole.toString()} ETH`;
  } catch {
    return rawBudget;
  }
}

function formatDeadline(value: string | number) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  const date = new Date(numericValue * 1000);
  return date.toLocaleString();
}

function formatStatus(status: ApiJob['status']) {
  if (status === 'open') {
    return 'Open';
  }
  if (status === 'negotiating') {
    return 'Negotiating';
  }
  if (status === 'locked') {
    return 'Funded';
  }
  if (status === 'completed') {
    return 'Completed';
  }
  return 'Cancelled';
}

export function TasksMonitor() {
  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [source, setSource] = useState<'loading' | 'api' | 'empty' | 'error'>('loading');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await listJobs();
        if (!active) {
          return;
        }

        if (response.jobs.length === 0) {
          setJobs([]);
          setSource('empty');
          return;
        }

        setJobs(response.jobs);
        setSource('api');
      } catch {
        if (active) {
          setJobs([]);
          setSource('error');
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
      <section className="panel deal-summary-bar slide-up">
        <span>Total tasks {jobs.length}</span>
        <span>Open {jobs.filter((job) => job.status === 'open').length}</span>
        <span>Negotiating {jobs.filter((job) => job.status === 'negotiating').length}</span>
        <span>
          {source === 'api'
            ? 'Live job board'
            : source === 'loading'
              ? 'Loading tasks'
              : source === 'empty'
                ? 'No tasks yet'
                : 'Live API unavailable'}
        </span>
      </section>

      <section className="deal-card-grid slide-up">
        {source === 'loading' && <article className="panel deal-card-minimal">Loading available tasks...</article>}
        {source === 'empty' && <article className="panel deal-card-minimal">No tasks are available right now.</article>}
        {source === 'error' && (
          <article className="panel deal-card-minimal">
            Could not fetch available tasks from the API. Check NEXT_PUBLIC_API_BASE_URL.
          </article>
        )}

        {jobs.map((job) => (
          <article key={job.id} className="panel deal-card-minimal">
            <div className="deal-row-top">
              <div>
                <p className="eyebrow">{job.category}</p>
                <h2>{job.title}</h2>
              </div>
              <span className={`pill pill-status ${job.status}`}>{formatStatus(job.status)}</span>
            </div>

            <div className="deal-row-body">
              <p className="deal-description">{job.description}</p>

              <div className="meta-grid">
                <div className="meta-item">
                  <span>Budget</span>
                  <strong>{formatBudget(job)}</strong>
                </div>
                <div className="meta-item">
                  <span>Deadline</span>
                  <strong>{formatDeadline(job.deadline)}</strong>
                </div>
                <div className="meta-item">
                  <span>Task ID</span>
                  <strong>{job.id}</strong>
                </div>
                <div className="meta-item">
                  <span>Status</span>
                  <strong>{formatStatus(job.status)}</strong>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

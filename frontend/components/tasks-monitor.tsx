'use client';

import { useEffect, useState } from 'react';
import { listDeals } from '@/lib/api/deals';
import { listJobs } from '@/lib/api/jobs';
import { fetchIpfsContent, fetchIpfsTaskDetails } from '@/lib/ipfs';
import type { ApiDeal, ApiJob } from '@/lib/types/api';

type DealTaskItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  source: 'job' | 'deal';
  deadlineLabel: string;
  budgetLabel: string;
  reference: string;
  resultCid?: string | null;
};

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

  return new Date(numericValue * 1000).toLocaleString();
}

function formatJobStatus(status: ApiJob['status']) {
  if (status === 'open') return 'Open';
  if (status === 'negotiating') return 'Negotiating';
  if (status === 'locked') return 'In deal';
  if (status === 'completed') return 'Completed';
  return 'Cancelled';
}

function formatDealStatus(status: ApiDeal['status']) {
  if (status === 'CREATED') return 'Negotiating';
  if (status === 'ACTIVE') return 'In progress';
  if (status === 'SUBMITTED') return 'Reviewing result';
  if (status === 'SETTLED') return 'Completed';
  if (status === 'REFUNDED') return 'Refunded';
  return 'Disputed';
}

function formatDealBudget(amount: string) {
  try {
    const wei = BigInt(amount);
    const base = BigInt('1000000000000000000');
    const whole = wei / base;
    const fraction = wei % base;
    const fractionText = fraction.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
    return `${fractionText ? `${whole.toString()}.${fractionText}` : whole.toString()} ETH`;
  } catch {
    return amount;
  }
}

async function mapDealTask(deal: ApiDeal): Promise<DealTaskItem> {
  const taskCid = deal.task_cid ?? deal.taskCid;
  const details = taskCid ? await fetchIpfsTaskDetails(taskCid).catch(() => null) : null;
  const rawId = deal.deal_id ?? deal.dealId ?? '0';
  const createdAt = deal.createdAt ?? deal.created_at;

  return {
    id: `deal-${rawId}`,
    title: details?.title ?? deal.job?.title ?? 'Task title unavailable',
    description: details?.description ?? 'Task details are linked to this deal.',
    category: details?.category ?? deal.job?.category ?? 'Deal task',
    status: formatDealStatus(deal.status),
    source: 'deal',
    deadlineLabel: createdAt ? new Date(createdAt).toLocaleString() : 'Tracked on-chain',
    budgetLabel: formatDealBudget(deal.amount),
    reference: `Deal #${rawId}`,
    resultCid: deal.result_cid ?? deal.resultCid ?? null,
  };
}

export function TasksMonitor() {
  const [openTasks, setOpenTasks] = useState<DealTaskItem[]>([]);
  const [dealTasks, setDealTasks] = useState<DealTaskItem[]>([]);
  const [source, setSource] = useState<'loading' | 'api' | 'empty' | 'error'>('loading');
  const [selectedResult, setSelectedResult] = useState<{
    title: string;
    reference: string;
    content: string;
  } | null>(null);
  const [resultState, setResultState] = useState<'idle' | 'loading' | 'error'>('idle');

  async function openResultModal(task: DealTaskItem) {
    if (!task.resultCid) {
      return;
    }

    setResultState('loading');
    setSelectedResult({
      title: task.title,
      reference: task.reference,
      content: '',
    });

    try {
      const response = await fetchIpfsContent(task.resultCid);
      setSelectedResult({
        title: task.title,
        reference: task.reference,
        content: response.formatted,
      });
      setResultState('idle');
    } catch {
      setResultState('error');
    }
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [jobsResponse, dealsResponse] = await Promise.all([
          listJobs({ status: 'open' }),
          listDeals({ limit: 12 }),
        ]);

        if (!active) {
          return;
        }

        const nextOpenTasks = jobsResponse.jobs
          .filter((job) => job.status === 'open' || job.status === 'negotiating')
          .map((job) => ({
            id: job.id,
            title: job.title,
            description: job.description,
            category: job.category,
            status: formatJobStatus(job.status),
            source: 'job' as const,
            deadlineLabel: formatDeadline(job.deadline),
            budgetLabel: formatBudget(job),
            reference: `Task ${job.id}`,
          }));

        const nextDealTasks = await Promise.all(
          dealsResponse.deals.map((deal) => mapDealTask(deal)),
        );

        if (!active) {
          return;
        }

        setOpenTasks(nextOpenTasks);
        setDealTasks(nextDealTasks);
        setSource(nextOpenTasks.length === 0 && nextDealTasks.length === 0 ? 'empty' : 'api');
      } catch {
        if (active) {
          setOpenTasks([]);
          setDealTasks([]);
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
        <span>Open tasks {openTasks.length}</span>
        <span>Tasks in deals {dealTasks.length}</span>
        <span>Total visible {openTasks.length + dealTasks.length}</span>
        <span>
          {source === 'api'
            ? 'Live task board'
            : source === 'loading'
              ? 'Loading tasks'
              : source === 'empty'
                ? 'No tasks yet'
                : 'Live API unavailable'}
        </span>
      </section>

      {source === 'loading' ? <section className="panel deal-summary-bar slide-up">Loading tasks...</section> : null}
      {source === 'error' ? (
        <section className="panel deal-summary-bar slide-up">
          Could not fetch tasks from the live API. Check NEXT_PUBLIC_API_BASE_URL.
        </section>
      ) : null}
      {source === 'empty' ? <section className="panel deal-summary-bar slide-up">No tasks are available right now.</section> : null}

      {openTasks.length > 0 ? (
        <>
          <section className="section-head slide-up">
            <p className="eyebrow">Open tasks</p>
            <h2>Ready to pick up</h2>
          </section>
          <section className="deal-card-grid slide-up">
            {openTasks.map((task) => (
              <article key={task.id} className="panel deal-card-minimal">
                <div className="deal-row-top">
                  <div>
                    <p className="eyebrow">{task.category}</p>
                    <h2>{task.title}</h2>
                  </div>
                  <span className="pill pill-status open">{task.status}</span>
                </div>

                <div className="deal-row-body">
                  <p className="deal-description">{task.description}</p>
                  <div className="meta-grid">
                    <div className="meta-item">
                      <span>Budget</span>
                      <strong>{task.budgetLabel}</strong>
                    </div>
                    <div className="meta-item">
                      <span>Deadline</span>
                      <strong>{task.deadlineLabel}</strong>
                    </div>
                    <div className="meta-item">
                      <span>Status</span>
                      <strong>{task.status}</strong>
                    </div>
                    <div className="meta-item">
                      <span>Reference</span>
                      <strong>{task.reference}</strong>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}

      {dealTasks.length > 0 ? (
        <>
          <section className="section-head slide-up">
            <p className="eyebrow">Tasks in deals</p>
            <h2>Already being worked on</h2>
          </section>
          <section className="deal-card-grid slide-up">
            {dealTasks.map((task) => (
              <article key={task.id} className="panel deal-card-minimal">
                <div className="deal-row-top">
                  <div>
                    <p className="eyebrow">{task.category}</p>
                    <h2>{task.title}</h2>
                  </div>
                  <span className="pill pill-status executing">{task.status}</span>
                </div>

                <div className="deal-row-body">
                  <p className="deal-description">{task.description}</p>
                  <div className="meta-grid">
                    <div className="meta-item">
                      <span>Escrow</span>
                      <strong>{task.budgetLabel}</strong>
                    </div>
                    <div className="meta-item">
                      <span>Started</span>
                      <strong>{task.deadlineLabel}</strong>
                    </div>
                    <div className="meta-item">
                      <span>Status</span>
                      <strong>{task.status}</strong>
                    </div>
                    <div className="meta-item">
                      <span>Reference</span>
                      <strong>{task.reference}</strong>
                    </div>
                  </div>
                  {task.resultCid ? (
                    <div className="deal-actions">
                      <button type="button" className="button" onClick={() => void openResultModal(task)}>
                        View result
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}

      {selectedResult ? (
        <div className="modal-backdrop" onClick={() => setSelectedResult(null)}>
          <div className="modal-panel panel" onClick={(event) => event.stopPropagation()}>
            <div className="delegation-head">
              <div>
                <p className="eyebrow">Submitted work</p>
                <h2>{selectedResult.title}</h2>
              </div>
              <button type="button" className="button" onClick={() => setSelectedResult(null)}>
                Close
              </button>
            </div>
            <p className="delegation-lead">
              This is the submitted result for {selectedResult.reference}.
            </p>
            {resultState === 'loading' ? (
              <div className="result-state">Loading the submitted result...</div>
            ) : resultState === 'error' ? (
              <div className="result-state">We couldn't open this result right now.</div>
            ) : (
              <pre className="delegation-code result-code">{selectedResult.content}</pre>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

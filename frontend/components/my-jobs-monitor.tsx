'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEMO_AGENT_ADDRESS } from '@/lib/config';
import { evaluateProposal, listJobProposals, listJobs } from '@/lib/api/jobs';
import type { ApiJob, ApiProposal } from '@/lib/types/api';

type JobWithProposals = {
  job: ApiJob;
  proposals: ApiProposal[];
};

function formatWeiAsEth(value: string) {
  try {
    const wei = BigInt(value);
    const base = BigInt('1000000000000000000');
    const whole = wei / base;
    const fraction = (wei % base).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    const formatted = fraction ? `${whole.toString()}.${fraction}` : whole.toString();
    return `${formatted} ETH`;
  } catch {
    return `${value} wei`;
  }
}

function formatTimestamp(value: string | number | undefined) {
  if (value === undefined) {
    return 'Unknown';
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return new Date(numeric * 1000).toLocaleString();
}

function workerLabel(proposal: ApiProposal) {
  return proposal.worker?.ens_name ?? proposal.worker?.ensName ?? proposal.worker_address ?? proposal.workerAddress ?? 'Unknown worker';
}

export function MyJobsMonitor() {
  const pageSize = 6;
  const [items, setItems] = useState<JobWithProposals[]>([]);
  const [source, setSource] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [page, setPage] = useState(0);
  const [totalJobs, setTotalJobs] = useState(0);
  const [evaluatingProposalId, setEvaluatingProposalId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const jobsResponse = await listJobs({
          limit: pageSize,
          offset: page * pageSize,
        });
        if (!active) {
          return;
        }

        const agentJobs = jobsResponse.jobs
          .filter((job) => (job.poster_address ?? job.posterAddress ?? '').toLowerCase() === DEMO_AGENT_ADDRESS.toLowerCase())
          .sort((left, right) => {
            const leftCreatedAt = left.created_at ?? left.createdAt ?? '';
            const rightCreatedAt = right.created_at ?? right.createdAt ?? '';
            return rightCreatedAt.localeCompare(leftCreatedAt);
          });

        setTotalJobs(jobsResponse.total);

        if (agentJobs.length === 0) {
          setItems([]);
          setSource('empty');
          return;
        }

        const proposalsByJob = await Promise.all(
          agentJobs.map(async (job) => ({
            job,
            proposals: (await listJobProposals(job.id)).proposals,
          })),
        );

        if (!active) {
          return;
        }

        setItems(proposalsByJob);
        setSource('ready');
      } catch {
        if (active) {
          setItems([]);
          setSource('error');
        }
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [page]);

  const totals = useMemo(() => {
    const jobs = totalJobs;
    const proposals = items.reduce((total, item) => total + item.proposals.length, 0);
    const pending = items.reduce(
      (total, item) => total + item.proposals.filter((proposal) => proposal.status === 'pending' || proposal.status === 'countered').length,
      0,
    );

    return { jobs, proposals, pending };
  }, [items, totalJobs]);

  const onAcceptProposal = async (jobId: string, proposal: ApiProposal) => {
    if (evaluatingProposalId) {
      return;
    }

    setEvaluatingProposalId(proposal.id);
    try {
      await evaluateProposal(jobId, proposal.id);

      const [jobsResponse, proposalsResponse] = await Promise.all([
        listJobs({
          limit: pageSize,
          offset: page * pageSize,
        }),
        listJobProposals(jobId),
      ]);
      const jobMap = new Map(jobsResponse.jobs.map((job) => [job.id, job]));

      setItems((current) =>
        current.map((item) =>
          item.job.id === jobId
            ? {
                job: jobMap.get(jobId) ?? item.job,
                proposals: proposalsResponse.proposals,
              }
            : item,
        ),
      );
    } finally {
      setEvaluatingProposalId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalJobs / pageSize));
  const showingFrom = totalJobs === 0 ? 0 : page * pageSize + 1;
  const showingTo = totalJobs === 0 ? 0 : Math.min(totalJobs, (page + 1) * pageSize);

  return (
    <>
      <section className="panel deal-summary-bar slide-up">
        <span>Jobs {totals.jobs}</span>
        <span>Total proposals {totals.proposals}</span>
        <span>Needs review {totals.pending}</span>
        <span>
          {source === 'loading'
            ? 'Loading jobs'
            : source === 'ready'
              ? 'Live proposal polling'
              : source === 'empty'
                ? 'No jobs yet'
                : 'Job feed unavailable'}
        </span>
      </section>

      {source === 'loading' ? <section className="panel delegation-panel">Loading your jobs...</section> : null}
      {source === 'empty' ? <section className="panel delegation-panel">No jobs posted by the task agent yet.</section> : null}
      {source === 'error' ? <section className="panel delegation-panel">Could not load jobs or proposals from the API.</section> : null}

      {source === 'ready' ? (
        <>
          <section className="my-jobs-grid slide-up">
            {items.map(({ job, proposals }) => (
              <article key={job.id} className="panel proposal-job-card">
                <div className="proposal-card-head">
                  <div>
                    <p className="eyebrow">{job.category}</p>
                    <h2>{job.title}</h2>
                  </div>
                  <span className="pill">{job.status}</span>
                </div>

                <p className="delegation-lead">{job.description}</p>

                <div className="proposal-meta">
                  <span>Budget {formatWeiAsEth(job.max_budget ?? job.maxBudget ?? '0')}</span>
                  <span>Deadline {formatTimestamp(job.deadline)}</span>
                </div>

                {proposals.length === 0 ? (
                  <div className="result-state">No proposals yet. This page is polling automatically.</div>
                ) : (
                  <div className="proposal-list">
                    {proposals.map((proposal) => {
                      const price = proposal.proposed_price ?? proposal.proposedPrice ?? '0';

                      return (
                        <article key={proposal.id} className="proposal-card">
                          <div className="proposal-card-head">
                            <div>
                              <p className="eyebrow">Proposal {proposal.id}</p>
                              <strong>{workerLabel(proposal)}</strong>
                            </div>
                            <span className="pill">{proposal.status}</span>
                          </div>

                          <div className="proposal-meta">
                            <span>Price {formatWeiAsEth(price)}</span>
                            <span>Deadline {formatTimestamp(proposal.proposed_deadline ?? proposal.proposedDeadline)}</span>
                          </div>

                          <p className="delegation-lead">{proposal.message}</p>

                          {proposal.status === 'pending' || proposal.status === 'countered' ? (
                            <div className="deal-actions">
                              <button
                                type="button"
                                className="button button-primary"
                                onClick={() => void onAcceptProposal(job.id, proposal)}
                                disabled={evaluatingProposalId === proposal.id}
                              >
                                {evaluatingProposalId === proposal.id
                                  ? 'Evaluating...'
                                  : proposal.status === 'countered'
                                    ? 'Accept counter-offer'
                                    : 'Accept proposal'}
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>
            ))}
          </section>

          {totalJobs > 0 ? (
            <section className="deal-pagination">
              <span>
                Showing {showingFrom}-{showingTo} of {totalJobs}
              </span>
              <div className="deal-pagination-actions">
                <button type="button" className="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>
                  Previous
                </button>
                <span>
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  className="button"
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}

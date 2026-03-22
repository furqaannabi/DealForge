'use client';

import { useEffect, useState } from 'react';
import { listDeals } from '@/lib/api/deals';
import { listJobs } from '@/lib/api/jobs';
import { fetchIpfsContent, fetchIpfsTaskTitle } from '@/lib/ipfs';
import type { DealCardData } from '@/lib/mock-data';
import type { ApiDeal, ApiJob } from '@/lib/types/api';

type DealMonitorItem = DealCardData & {
  payer: string;
  resultCid?: string | null;
};

const STATUS_DETAILS: Record<DealCardData['status'], { progress: number; confirmation: DealCardData['confirmation'] }> = {
  NEGOTIATING: { progress: 20, confirmation: 'Pending' },
  ESCROW_CREATED: { progress: 35, confirmation: 'Confirmed' },
  EXECUTING: { progress: 60, confirmation: 'Confirmed' },
  RESULT_SUBMITTED: { progress: 85, confirmation: 'Confirmed' },
  SETTLED: { progress: 100, confirmation: 'Finalized' },
  REFUNDED: { progress: 100, confirmation: 'Finalized' },
  DISPUTED: { progress: 100, confirmation: 'Confirmed' },
};

function formatShortTxHash(txHash: string) {
  if (txHash.length <= 12) {
    return txHash;
  }

  return `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
}

function formatShortAddress(address: string) {
  if (address.length <= 24) {
    return address;
  }

  return `${address.slice(0, 18)}....${address.slice(-8)}`;
}

function formatAmount(amount: string) {
  try {
    const wei = BigInt(amount);
    const base = BigInt('1000000000000000000');
    const whole = wei / base;
    const fraction = wei % base;
    const fractionStr = fraction.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    const formatted = fractionStr.length > 0 ? `${whole.toString()}.${fractionStr}` : whole.toString();

    return `${formatted} ETH`;
  } catch {
    return amount;
  }
}

async function resolveDealTaskTitle(deal: ApiDeal, jobsById: Map<string, ApiJob>) {
  if (deal.job?.title) {
    return deal.job.title;
  }

  const jobId = deal.job_id ?? deal.jobId;
  if (jobId) {
    const job = jobsById.get(jobId);
    if (job?.title) {
      return job.title;
    }
  }

  const taskCid = deal.task_cid ?? deal.taskCid;
  if (taskCid) {
    try {
      const title = await fetchIpfsTaskTitle(taskCid);
      if (title) {
        return title;
      }
    } catch {
      // Ignore IPFS title lookup failures and fall back below.
    }
  }

  return 'Task title unavailable';
}

async function mapApiDeal(deal: ApiDeal, jobsById: Map<string, ApiJob>): Promise<DealMonitorItem> {
  const status =
    deal.status === 'CREATED'
      ? 'NEGOTIATING'
      : deal.status === 'ACTIVE'
        ? 'EXECUTING'
        : deal.status === 'SUBMITTED'
          ? 'RESULT_SUBMITTED'
          : deal.status;
  const statusDetails = STATUS_DETAILS[status];
  const rawId = deal.deal_id ?? deal.dealId ?? '0';
  const id = Number.parseInt(String(rawId), 10) || 0;
  const txHash = deal.tx_hash ?? deal.txHash ?? `0x${String(rawId).padStart(64, '0')}`;
  const createdAt = deal.createdAt ?? deal.created_at;
  const displayDate = createdAt ? new Date(createdAt).toLocaleString() : 'Tracked on-chain';

  return {
    id,
    payer: deal.payer,
    worker: deal.worker,
    task: await resolveDealTaskTitle(deal, jobsById),
    escrow: formatAmount(deal.amount),
    status,
    deadline: displayDate,
    txHash,
    resultCid: deal.result_cid ?? deal.resultCid ?? null,
    progress: statusDetails.progress,
    confirmation: statusDetails.confirmation,
    timeline: [
      { label: 'Deal Created', complete: true },
      { label: 'Escrow Locked', complete: true },
      { label: 'Worker Executing', complete: status !== 'NEGOTIATING' },
      { label: 'Result Submitted', complete: status === 'RESULT_SUBMITTED' || status === 'SETTLED' || status === 'DISPUTED' },
      {
        label: status === 'REFUNDED' ? 'Payment Refunded' : status === 'DISPUTED' ? 'In Dispute' : 'Payment Released',
        complete: status === 'SETTLED' || status === 'REFUNDED' || status === 'DISPUTED',
      },
    ],
  };
}

export function DealsMonitor() {
  const pageSize = 6;
  const [items, setItems] = useState<DealMonitorItem[]>([]);
  const [source, setSource] = useState<'api' | 'empty' | 'error' | 'loading'>('loading');
  const [page, setPage] = useState(0);
  const [totalDeals, setTotalDeals] = useState(0);
  const [copiedAddressKey, setCopiedAddressKey] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<{
    dealId: number;
    cid: string;
    content: string;
    isJson: boolean;
  } | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<DealMonitorItem | null>(null);
  const [resultState, setResultState] = useState<'idle' | 'loading' | 'error'>('idle');

  async function copyAddress(key: string, address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddressKey(key);
      setTimeout(() => setCopiedAddressKey((current) => (current === key ? null : current)), 1200);
    } catch {
      setCopiedAddressKey(null);
    }
  }

  async function openResultModal(deal: DealMonitorItem) {
    if (!deal.resultCid) {
      return;
    }

    setSelectedDeal(null);
    setResultState('loading');
    setSelectedResult({
      dealId: deal.id,
      cid: deal.resultCid,
      content: '',
      isJson: false,
    });

    try {
      const response = await fetchIpfsContent(deal.resultCid);
      setSelectedResult({
        dealId: deal.id,
        cid: deal.resultCid,
        content: response.formatted,
        isJson: response.isJson,
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
        const [dealsResponse, jobsResponse] = await Promise.all([
          listDeals({ limit: pageSize, offset: page * pageSize }),
          listJobs(),
        ]);
        if (!active) {
          return;
        }

        setTotalDeals(dealsResponse.total);

        if (dealsResponse.deals.length === 0) {
          setItems([]);
          setSource('empty');
          return;
        }

        const jobsById = new Map(jobsResponse.jobs.map((job) => [job.id, job]));

        const mappedDeals = await Promise.all(
          dealsResponse.deals.map((deal) => mapApiDeal(deal, jobsById)),
        );

        if (!active) {
          return;
        }

        setItems(mappedDeals);
        setSource('api');
      } catch {
        if (active) {
          setItems([]);
          setSource('error');
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [page]);

  const liveCount = items.filter((deal) => deal.status === 'EXECUTING' || deal.status === 'RESULT_SUBMITTED').length;
  const finalizedCount = items.filter((deal) => deal.status === 'SETTLED').length;
  const escrowTotal = items
    .reduce((total, deal) => total + (Number.parseFloat(deal.escrow) || 0), 0)
    .toFixed(4);
  const totalPages = Math.max(1, Math.ceil(totalDeals / pageSize));
  const showingFrom = totalDeals === 0 ? 0 : page * pageSize + 1;
  const showingTo = totalDeals === 0 ? 0 : Math.min(totalDeals, (page + 1) * pageSize);

  return (
    <>
      <section className="panel deal-summary-bar slide-up">
        <span>Active {liveCount}</span>
        <span>Funded {escrowTotal} ETH</span>
        <span>Completed {finalizedCount}</span>
        <span>
          {source === 'api'
            ? 'Live updates'
            : source === 'loading'
              ? 'Loading deals'
              : source === 'empty'
                ? 'No deals yet'
                : 'Live API unavailable'}
        </span>
      </section>

      <section className="deal-card-grid slide-up">
        {source === 'loading' && <article className="panel deal-card-minimal">Loading live deals...</article>}
        {source === 'empty' && <article className="panel deal-card-minimal">No deals found in the API yet.</article>}
        {source === 'error' && (
          <article className="panel deal-card-minimal">
            Could not fetch deals from the live API. Check NEXT_PUBLIC_API_BASE_URL.
          </article>
        )}

        {items.map((deal) => (
          <article
            key={deal.id}
            className="panel deal-card-minimal deal-card-clickable"
            role="button"
            tabIndex={0}
            onClick={() => setSelectedDeal(deal)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelectedDeal(deal);
              }
            }}
          >
            <div className="deal-row-top">
              <div>
                <p className="eyebrow">Deal #{deal.id}</p>
                <h2>{deal.task}</h2>
              </div>
              <span className={`pill pill-status ${deal.status.toLowerCase()}`}>{deal.status}</span>
            </div>

            <div className="deal-row-body">
              <div className="deal-card-summary">
                <div className="deal-summary-chip">
                  <span>Payer</span>
                  <strong>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void copyAddress(`payer-${deal.id}`, deal.payer);
                      }}
                      title="Click to copy full payer address"
                      style={{ cursor: 'copy', background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit' }}
                    >
                      {copiedAddressKey === `payer-${deal.id}` ? 'Copied' : formatShortAddress(deal.payer)}
                    </button>
                  </strong>
                </div>
                <div className="deal-summary-chip">
                  <span>Worker</span>
                  <strong>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void copyAddress(`worker-${deal.id}`, deal.worker);
                      }}
                      title="Click to copy full worker address"
                      style={{ cursor: 'copy', background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit' }}
                    >
                      {copiedAddressKey === `worker-${deal.id}` ? 'Copied' : formatShortAddress(deal.worker)}
                    </button>
                  </strong>
                </div>
                <div className="deal-summary-chip">
                  <span>Escrow</span>
                  <strong>{deal.escrow}</strong>
                </div>
                <div className="deal-summary-chip">
                  <span>Confirmation</span>
                  <strong>{deal.confirmation}</strong>
                </div>
              </div>

              <div className="progress-head">
                <span>{deal.confirmation}</span>
                <strong>{deal.progress}%</strong>
              </div>

              <div className="progress-track compact">
                <div className="progress-fill" style={{ width: `${deal.progress}%` }} />
              </div>

              <div className="deal-card-footer">
                <span className="mini-meta">{deal.deadline}</span>
                <span className="mini-meta">Open details</span>
              </div>
            </div>
          </article>
        ))}
      </section>

      {source === 'api' && totalDeals > 0 ? (
        <section className="deal-pagination">
          <span>
            Showing {showingFrom}-{showingTo} of {totalDeals}
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

      {selectedResult ? (
        <div className="modal-backdrop" onClick={() => setSelectedResult(null)}>
          <div className="modal-panel panel modal-panel-result" onClick={(event) => event.stopPropagation()}>
            <div className="delegation-head">
              <div>
                <p className="eyebrow">Submitted work</p>
                <h2>Review result</h2>
              </div>
              <button type="button" className="button" onClick={() => setSelectedResult(null)}>
                Close
              </button>
            </div>
            <p className="delegation-lead">
              This is the work shared for deal #{selectedResult.dealId}.
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

      {selectedDeal && !selectedResult ? (
        <div className="modal-backdrop" onClick={() => setSelectedDeal(null)}>
          <div className="modal-panel panel modal-panel-deal" onClick={(event) => event.stopPropagation()}>
            <div className="delegation-head">
              <div>
                <p className="eyebrow">Deal #{selectedDeal.id}</p>
                <h2>{selectedDeal.task}</h2>
              </div>
              <div className="deal-modal-header-actions">
                {selectedDeal.resultCid ? (
                  <button type="button" className="button" onClick={() => void openResultModal(selectedDeal)}>
                    View submitted result
                  </button>
                ) : null}
                <button type="button" className="button" onClick={() => setSelectedDeal(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="meta-grid deal-detail-grid">
              <div className="meta-item">
                <span>Status</span>
                <strong>{selectedDeal.status}</strong>
              </div>
              <div className="meta-item">
                <span>Escrow</span>
                <strong>{selectedDeal.escrow}</strong>
              </div>
              <div className="meta-item">
                <span>Payer Agent</span>
                <strong className="address-text">{selectedDeal.payer}</strong>
              </div>
              <div className="meta-item">
                <span>Worker Agent</span>
                <strong className="address-text">{selectedDeal.worker}</strong>
              </div>
              <div className="meta-item">
                <span>Confirmation</span>
                <strong>{selectedDeal.confirmation}</strong>
              </div>
              <div className="meta-item">
                <span>Tracked at</span>
                <strong>{selectedDeal.deadline}</strong>
              </div>
              <div className="meta-item">
                <span>Transaction</span>
                <a className="address-text" href={`https://sepolia.basescan.org/tx/${selectedDeal.txHash}`} target="_blank" rel="noreferrer">
                  {selectedDeal.txHash}
                </a>
              </div>
            </div>

            <div className="progress-head">
              <span>Progress</span>
              <strong>{selectedDeal.progress}%</strong>
            </div>

            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${selectedDeal.progress}%` }} />
            </div>

            <div className="timeline-minimal">
              {selectedDeal.timeline.map((step) => (
                <div key={`${selectedDeal.id}-${step.label}`} className={step.complete ? 'timeline-item complete' : 'timeline-item'}>
                  <span className="timeline-bullet" />
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

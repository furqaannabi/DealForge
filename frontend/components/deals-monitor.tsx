'use client';

import { useEffect, useState } from 'react';
import { getAgentDeals } from '@/lib/api/agents';
import { deals as fallbackDeals, formatTxHash, type DealCardData } from '@/lib/mock-data';
import type { AgentDealsResponse, ApiDeal } from '@/lib/types/api';

function formatAmount(amount: string) {
  const normalized = Number(amount) / 1_000_000;
  return Number.isFinite(normalized) && normalized > 0 ? `${normalized.toFixed(2)} USDC` : amount;
}

function mapApiDeal(deal: ApiDeal): DealCardData {
  const status =
    deal.status === 'CREATED'
      ? 'NEGOTIATING'
      : deal.status === 'ACTIVE'
        ? 'EXECUTING'
        : deal.status === 'SUBMITTED'
          ? 'RESULT_SUBMITTED'
          : deal.status;
  const id = deal.deal_id ?? deal.dealId ?? 0;
  const txHash = deal.tx_hash ?? deal.txHash ?? `0x${String(id).padStart(64, '0')}`;

  return {
    id,
    worker: deal.worker,
    task: 'Live on-chain deal mirrored from the coordination API.',
    escrow: formatAmount(deal.amount),
    status,
    deadline: 'Tracked on-chain',
    txHash,
    progress: status === 'SETTLED' ? 100 : status === 'RESULT_SUBMITTED' ? 84 : status === 'EXECUTING' ? 58 : 32,
    confirmation: status === 'SETTLED' ? 'Finalized' : 'Confirmed',
    timeline: [
      { label: 'Deal Created', complete: true },
      { label: 'Escrow Locked', complete: true },
      { label: 'Worker Executing', complete: status !== 'NEGOTIATING' },
      { label: 'Result Submitted', complete: status === 'RESULT_SUBMITTED' || status === 'SETTLED' },
      { label: 'Payment Released', complete: status === 'SETTLED' },
    ],
  };
}

export function DealsMonitor() {
  const [items, setItems] = useState<DealCardData[]>(fallbackDeals);
  const [source, setSource] = useState<'api' | 'fallback'>('fallback');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response: AgentDealsResponse = await getAgentDeals();
        const merged = [...response.deals_as_payer, ...response.deals_as_worker];
        if (!active || merged.length === 0) {
          return;
        }

        setItems(merged.slice(0, 6).map(mapApiDeal));
        setSource('api');
      } catch {
        if (active) {
          setSource('fallback');
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const liveCount = items.filter((deal) => deal.status === 'EXECUTING' || deal.status === 'RESULT_SUBMITTED').length;
  const finalizedCount = items.filter((deal) => deal.status === 'SETTLED').length;
  const escrowTotal = items
    .reduce((total, deal) => total + (Number.parseFloat(deal.escrow) || 0), 0)
    .toFixed(1);

  return (
    <>
      <section className="deal-summary slide-up">
        <article className="panel summary-tile">
          <span>Live</span>
          <strong>{liveCount}</strong>
          <p>{source === 'api' ? 'Loaded from agent deal history' : 'Fallback deal snapshot'}</p>
        </article>
        <article className="panel summary-tile">
          <span>Escrow visible</span>
          <strong>{escrowTotal} USDC</strong>
          <p>Across the deals currently displayed</p>
        </article>
        <article className="panel summary-tile">
          <span>Finalized</span>
          <strong>{finalizedCount}</strong>
          <p>{source === 'api' ? 'Mirrored from on-chain status' : 'Static demo completion state'}</p>
        </article>
      </section>

      <section className="deal-grid slide-up">
        {items.map((deal) => (
          <article key={deal.id} className="panel deal-card-minimal">
            <div className="section-head">
              <div>
                <p className="eyebrow">Deal #{deal.id}</p>
                <h2>{deal.worker}</h2>
              </div>
              <span className={`pill pill-status ${deal.status.toLowerCase()}`}>{deal.status}</span>
            </div>

            <p className="deal-description">{deal.task}</p>

            <div className="meta-grid">
              <div className="meta-item">
                <span>Escrow</span>
                <strong>{deal.escrow}</strong>
              </div>
              <div className="meta-item">
                <span>Deadline</span>
                <strong>{deal.deadline}</strong>
              </div>
              <div className="meta-item">
                <span>Confirmation</span>
                <strong>{deal.confirmation}</strong>
              </div>
              <div className="meta-item">
                <span>Transaction</span>
                <a href={`https://basescan.org/tx/${deal.txHash}`} target="_blank" rel="noreferrer">
                  {formatTxHash(deal.txHash)}
                </a>
              </div>
            </div>

            <div className="progress-head">
              <span>Lifecycle progress</span>
              <strong>{deal.progress}%</strong>
            </div>

            <div className="progress-track compact">
              <div className="progress-fill" style={{ width: `${deal.progress}%` }} />
            </div>

            <div className="timeline-minimal">
              {deal.timeline.map((step) => (
                <div key={`${deal.id}-${step.label}`} className={step.complete ? 'timeline-item complete' : 'timeline-item'}>
                  <span className="timeline-bullet" />
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

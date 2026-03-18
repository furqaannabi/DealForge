/**
 * Event Indexer — listens to DealForge on-chain events and keeps the
 * PostgreSQL mirror in sync. Runs as a background service inside the API
 * process. Per the architecture doc: "On-chain deal events are reflected in
 * API within 15 seconds."
 */

import { ethers } from 'ethers';
import { config } from '../config';
import { db } from '../db/client';
import { DealStatus, JobStatus, ProposalStatus } from '../../generated/prisma/client';
import { redeemDelegation } from '../agent/delegation-redeemer';
import { getContractForEvents } from './contract';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dealId(raw: bigint): bigint {
  return BigInt(raw);
}

/** Update deal status; optionally set settledAt. Silently skips missing deals. */
async function updateDealStatus(
  id: bigint,
  status: DealStatus,
  extra: { settledAt?: Date } = {},
): Promise<void> {
  await db.deal.updateMany({
    where: { dealId: id },
    data: { status, ...extra },
  });
}

/** Transition the job linked to a deal into a new status. */
async function updateLinkedJob(dealId: bigint, jobStatus: JobStatus): Promise<void> {
  const deal = await db.deal.findUnique({ where: { dealId }, select: { jobId: true } });
  if (!deal?.jobId) return;
  await db.job.update({ where: { id: deal.jobId }, data: { status: jobStatus } });
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function onDealCreated(
  rawId: bigint,
  payer: string,
  worker: string,
  token: string,
  amount: bigint,
  _deadline: bigint,
  _taskHash: string,
  event: ethers.EventLog,
): Promise<void> {
  const id = dealId(rawId);
  console.log(`[indexer] DealCreated #${id} payer=${payer} worker=${worker}`);
  try {
    await db.deal.upsert({
      where: { dealId: id },
      create: {
        dealId: id,
        jobId: null,
        payer: payer.toLowerCase(),
        worker: worker.toLowerCase(),
        amount: amount.toString(),
        status: DealStatus.CREATED,
        txHash: event.transactionHash,
      },
      update: {
        // If it was already mirrored via POST /deals, just confirm status
        status: DealStatus.CREATED,
        txHash: event.transactionHash,
      },
    });
  } catch (err) {
    console.error(`[indexer] DealCreated #${id} error:`, err);
  }
}

async function onDealAccepted(rawId: bigint): Promise<void> {
  const id = dealId(rawId);
  console.log(`[indexer] DealAccepted #${id}`);
  try {
    await updateDealStatus(id, DealStatus.ACTIVE);
  } catch (err) {
    console.error(`[indexer] DealAccepted #${id} error:`, err);
  }
}

async function onResultSubmitted(rawId: bigint): Promise<void> {
  const id = dealId(rawId);
  console.log(`[indexer] ResultSubmitted #${id}`);
  try {
    await updateDealStatus(id, DealStatus.SUBMITTED);
  } catch (err) {
    console.error(`[indexer] ResultSubmitted #${id} error:`, err);
  }
}

async function onDealSettled(rawId: bigint): Promise<void> {
  const id = dealId(rawId);
  console.log(`[indexer] DealSettled #${id}`);
  try {
    await updateDealStatus(id, DealStatus.SETTLED, { settledAt: new Date() });
    await updateLinkedJob(id, JobStatus.completed);
  } catch (err) {
    console.error(`[indexer] DealSettled #${id} error:`, err);
  }
}

async function onDealRefunded(rawId: bigint): Promise<void> {
  const id = dealId(rawId);
  console.log(`[indexer] DealRefunded #${id}`);
  try {
    await updateDealStatus(id, DealStatus.REFUNDED);
    await updateLinkedJob(id, JobStatus.cancelled);
  } catch (err) {
    console.error(`[indexer] DealRefunded #${id} error:`, err);
  }
}

async function onDisputeRaised(rawId: bigint): Promise<void> {
  const id = dealId(rawId);
  console.log(`[indexer] DisputeRaised #${id}`);
  try {
    await updateDealStatus(id, DealStatus.DISPUTED);
  } catch (err) {
    console.error(`[indexer] DisputeRaised #${id} error:`, err);
  }
}

async function onDisputeResolved(rawId: bigint, paidWorker: boolean): Promise<void> {
  const id = dealId(rawId);
  console.log(`[indexer] DisputeResolved #${id} paidWorker=${paidWorker}`);
  try {
    const finalStatus = paidWorker ? DealStatus.SETTLED : DealStatus.REFUNDED;
    const extra = paidWorker ? { settledAt: new Date() } : {};
    await updateDealStatus(id, finalStatus, extra);
    if (paidWorker) {
      await updateLinkedJob(id, JobStatus.completed);
    } else {
      await updateLinkedJob(id, JobStatus.cancelled);
    }
  } catch (err) {
    console.error(`[indexer] DisputeResolved #${id} error:`, err);
  }
}

async function onVerifierApprovalRecorded(rawId: bigint): Promise<void> {
  const id = dealId(rawId);
  console.log(`[indexer] VerifierApprovalRecorded #${id} — attempting delegation redemption`);

  try {
    const mirroredDeal = await db.deal.findUnique({
      where: { dealId: id },
      select: { jobId: true, worker: true },
    });

    if (!mirroredDeal?.jobId) {
      console.warn(`[indexer] VerifierApprovalRecorded #${id} skipped: no linked job found in DB mirror`);
      return;
    }

    const acceptedProposal = await db.proposal.findFirst({
      where: {
        jobId: mirroredDeal.jobId,
        status: ProposalStatus.accepted,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        workerAddress: true,
      },
    });

    if (!acceptedProposal) {
      console.warn(`[indexer] VerifierApprovalRecorded #${id} skipped: no accepted proposal found for job ${mirroredDeal.jobId}`);
      return;
    }

    const workerAddress = acceptedProposal.workerAddress || mirroredDeal.worker;
    const txHash = await redeemDelegation(
      id.toString(),
      acceptedProposal.id,
      workerAddress,
    );

    console.log(`[indexer] Delegation redeemed for deal #${id}. tx: ${txHash}`);
  } catch (err) {
    console.error(`[indexer] Delegation redemption failed for deal #${id}:`, err);
  }
}



// ─── Lifecycle ────────────────────────────────────────────────────────────────

let _contract: ethers.Contract | null = null;

function attachListeners(contract: ethers.Contract): void {
  contract.on('DealCreated', onDealCreated);
  contract.on('DealAccepted', onDealAccepted);
  contract.on('ResultSubmitted', onResultSubmitted);
  contract.on('DealSettled', onDealSettled);
  contract.on('DealRefunded', onDealRefunded);
  contract.on('DisputeRaised', onDisputeRaised);
  contract.on('DisputeResolved', onDisputeResolved);
  contract.on('VerifierApprovalRecorded', onVerifierApprovalRecorded);
}

/**
 * Start the event indexer. Safe to call even if the contract address is not
 * yet configured — it will log a warning and return without error.
 *
 * Reconnects automatically every 60 s if the provider drops.
 */
export function startEventIndexer(): void {
  if (!config.DEALFORGE_CONTRACT_ADDRESS) {
    console.warn('[indexer] DEALFORGE_CONTRACT_ADDRESS not set — event indexer disabled');
    return;
  }

  let contract: ethers.Contract;
  try {
    contract = getContractForEvents();
    attachListeners(contract);
    _contract = contract;
    console.log(`✅ Event indexer listening via Alchemy WS on ${config.DEALFORGE_CONTRACT_ADDRESS}`);
  } catch (err) {
    console.error('[indexer] Failed to start:', err);
    setTimeout(startEventIndexer, 60_000);
    return;
  }

  // Reconnect on WebSocket close or error
  const wsProvider = _contract!.runner as ethers.WebSocketProvider;
  const reconnect = (label: string) => () => {
    console.error(`[indexer] WS ${label} — reconnecting in 10 s`);
    stopEventIndexer();
    setTimeout(startEventIndexer, 10_000);
  };
  wsProvider.websocket.onclose = reconnect('closed');
  wsProvider.websocket.onerror = reconnect('error');
}

export function stopEventIndexer(): void {
  if (_contract) {
    _contract.removeAllListeners();
    const wsProvider = _contract.runner as ethers.WebSocketProvider;
    wsProvider.destroy().catch(() => {});
    _contract = null;
  }
}

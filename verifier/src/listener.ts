/**
 * EventListener — subscribes to DealForge contract events and triggers the
 * verification pipeline for each ResultSubmitted event.
 */

import { ethers } from 'ethers';
import { config } from './config';
import { fetchTask, fetchResult } from './ipfs';
import { verify } from './engine';
import { submitVote } from './vote';
import { stats } from './health';

const ABI = [
  'function getDeal(uint256 dealId) view returns (tuple(uint256 id, address payer, address worker, address token, uint256 amount, uint256 deadline, bytes32 taskHash, bytes32 resultHash, uint8 status, uint256 createdAt, uint256 submittedAt))',
  'event ResultSubmitted(uint256 indexed dealId, bytes32 resultHash, uint256 submittedAt)',
  'event DealCreated(uint256 indexed dealId, address indexed payer, address indexed worker, address token, uint256 amount, uint256 deadline, bytes32 taskHash)',
  'event DisputeRaised(uint256 indexed dealId, address initiator, uint256 raisedAt)',
];

// Limit concurrent verifications to avoid RPC / LLM rate limits
const inFlight = new Set<bigint>();

// ─── Core pipeline (shared by live listener and startup scan) ─────────────────

export async function processSubmittedDeal(
  dealId: bigint,
  provider: ethers.Provider,
): Promise<void> {
  if (inFlight.size >= config.MAX_CONCURRENT_JOBS) {
    console.warn(`[listener] Max concurrent jobs (${config.MAX_CONCURRENT_JOBS}) reached — skipping deal #${dealId}`);
    return;
  }
  if (inFlight.has(dealId)) return;
  inFlight.add(dealId);

  try {
    // ── 1. Fetch deal from chain ──────────────────────────────────────────────
    const readContract = new ethers.Contract(config.CONTRACT_ADDRESS, ABI, provider);
    const deal = await readContract.getDeal(dealId);

    // Skip if no longer SUBMITTED (another verifier may have already acted)
    // Contract DealStatus enum: 0=CREATED 1=ACTIVE 2=SUBMITTED 3=SETTLED 4=REFUNDED 5=DISPUTED
    if (Number(deal.status) !== 2) {
      console.log(`[listener] Deal #${dealId} is no longer SUBMITTED (status=${deal.status}) — skipping`);
      return;
    }

    const taskHashHex: string = deal.taskHash;
    const resultHashHex: string = deal.resultHash;

    // ── 2. Fetch content from IPFS ────────────────────────────────────────────
    console.log(`[listener] Fetching task from IPFS (${taskHashHex})`);
    const task = await fetchTask(taskHashHex);

    console.log(`[listener] Fetching result from IPFS (${resultHashHex})`);
    const result = await fetchResult(resultHashHex);

    // ── 3. Run verification ───────────────────────────────────────────────────
    console.log(`[listener] Running verification for deal #${dealId} (type: ${task.verificationPlan?.type ?? 'llm_judge'})`);
    const outcome = await verify(task, result);

    console.log(`[listener] Verdict for #${dealId}: ${outcome.decision} (score=${outcome.score}) — ${outcome.reasoning}`);

    // ── 4. Submit vote on-chain ───────────────────────────────────────────────
    const txHash = await submitVote(dealId, outcome.decision);
    console.log(`[listener] Vote submitted for #${dealId}: ${txHash}`);

    stats.verified++;
    if (outcome.decision === 'ACCEPT') stats.accepted++;
    else stats.rejected++;

  } catch (err) {
    stats.errors++;
    console.error(`[listener] Failed to process deal #${dealId}:`, err);
  } finally {
    inFlight.delete(dealId);
  }
}

async function handleResultSubmitted(
  rawDealId: bigint,
  _resultHash: string,
  _submittedAt: bigint,
  event: ethers.EventLog,
): Promise<void> {
  const dealId = BigInt(rawDealId);
  console.log(`[listener] ResultSubmitted #${dealId} tx=${event.transactionHash}`);
  await processSubmittedDeal(dealId, event.provider as ethers.Provider);
}

let _contract: ethers.Contract | null = null;

export function startListener(): void {
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const contract = new ethers.Contract(config.CONTRACT_ADDRESS, ABI, provider);

  contract.on('ResultSubmitted', handleResultSubmitted);

  // Log other events for observability (no action needed)
  contract.on('DealCreated', (dealId: bigint) => {
    console.log(`[listener] DealCreated #${BigInt(dealId)}`);
  });
  contract.on('DisputeRaised', (dealId: bigint) => {
    console.log(`[listener] DisputeRaised #${BigInt(dealId)} — already in dispute, skipping`);
  });

  _contract = contract;

  // Reconnect on provider errors
  (provider as ethers.JsonRpcProvider).on('error', (err: Error) => {
    console.error('[listener] Provider error — reconnecting in 10 s:', err.message);
    stopListener();
    setTimeout(startListener, 10_000);
  });

  console.log(`✅ Listener active on ${config.CONTRACT_ADDRESS} via ${config.RPC_URL}`);
}

export function stopListener(): void {
  if (_contract) {
    _contract.removeAllListeners();
    _contract = null;
  }
}

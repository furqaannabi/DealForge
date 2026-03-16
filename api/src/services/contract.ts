import { ethers } from 'ethers';
import { config } from '../config';
import { db } from '../db/client';
import { DealStatus } from '../../generated/prisma/client';

// ─── ABI (inline to avoid shared/ path resolution issues in builds) ───────────

const DEALFORGE_ABI = [
  'function getDeal(uint256 dealId) view returns (tuple(uint256 id, address payer, address worker, address token, uint256 amount, uint256 deadline, bytes32 taskHash, bytes32 resultHash, uint8 status, uint256 createdAt, uint256 submittedAt))',
  'function getDealsForPayer(address payer) view returns (uint256[])',
  'function getDealsForWorker(address worker) view returns (uint256[])',
  'function dealCounter() view returns (uint256)',
  'event DealCreated(uint256 indexed dealId, address indexed payer, address indexed worker, address token, uint256 amount, uint256 deadline, bytes32 taskHash)',
  'event DealAccepted(uint256 indexed dealId, uint256 activationTime)',
  'event ResultSubmitted(uint256 indexed dealId, bytes32 resultHash, uint256 submittedAt)',
  'event DealSettled(uint256 indexed dealId, address recipient, uint256 payout)',
  'event DealRefunded(uint256 indexed dealId, address recipient, uint256 refundAmount)',
  'event DisputeRaised(uint256 indexed dealId, address initiator, uint256 raisedAt)',
  'event DisputeResolved(uint256 indexed dealId, bool paidWorker)',
] as const;

// On-chain DealStatus enum order matches contract: 0=CREATED,1=ACTIVE,2=SUBMITTED,3=SETTLED,4=REFUNDED,5=DISPUTED
const STATUS_MAP: DealStatus[] = [
  DealStatus.CREATED,
  DealStatus.ACTIVE,
  DealStatus.SUBMITTED,
  DealStatus.SETTLED,
  DealStatus.REFUNDED,
  DealStatus.DISPUTED,
];

// ─── Provider / contract ──────────────────────────────────────────────────────

function getRpcUrl(): string {
  return config.NODE_ENV === 'production'
    ? config.BASE_RPC_URL
    : config.BASE_SEPOLIA_RPC_URL;
}

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getRpcUrl());
}

export function getContract(): ethers.Contract {
  const address = config.DEALFORGE_CONTRACT_ADDRESS;
  if (!address) throw new Error('DEALFORGE_CONTRACT_ADDRESS is not set in environment');
  return new ethers.Contract(address, DEALFORGE_ABI, getProvider());
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnChainDeal {
  id: bigint;
  payer: string;
  worker: string;
  token: string;
  amount: bigint;
  deadline: bigint;
  taskHash: string;
  resultHash: string;
  status: DealStatus;
  createdAt: bigint;
  submittedAt: bigint;
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

export async function getDealOnChain(dealId: bigint): Promise<OnChainDeal> {
  const contract = getContract();
  const d = await contract.getDeal(dealId);
  return {
    id: BigInt(d.id),
    payer: d.payer.toLowerCase(),
    worker: d.worker.toLowerCase(),
    token: d.token.toLowerCase(),
    amount: BigInt(d.amount),
    deadline: BigInt(d.deadline),
    taskHash: d.taskHash,
    resultHash: d.resultHash,
    status: STATUS_MAP[Number(d.status)] ?? DealStatus.CREATED,
    createdAt: BigInt(d.createdAt),
    submittedAt: BigInt(d.submittedAt),
  };
}

export async function getDealIdsForPayer(payer: string): Promise<bigint[]> {
  const contract = getContract();
  const ids: bigint[] = await contract.getDealsForPayer(payer);
  return ids.map(BigInt);
}

export async function getDealIdsForWorker(worker: string): Promise<bigint[]> {
  const contract = getContract();
  const ids: bigint[] = await contract.getDealsForWorker(worker);
  return ids.map(BigInt);
}

// ─── DB sync ──────────────────────────────────────────────────────────────────

/**
 * Pull the latest state for `dealId` from chain and upsert into the DB.
 * On creation (upsert create path), `txHash` must be supplied by the caller.
 */
export async function syncDealToDb(
  dealId: bigint,
  opts: { jobId?: string; txHash?: string } = {},
): Promise<void> {
  const onChain = await getDealOnChain(dealId);
  const settledAt = onChain.status === DealStatus.SETTLED ? new Date() : undefined;

  await db.deal.upsert({
    where: { dealId },
    create: {
      dealId,
      jobId: opts.jobId ?? null,
      payer: onChain.payer,
      worker: onChain.worker,
      amount: onChain.amount.toString(),
      status: onChain.status,
      txHash: opts.txHash ?? '',
      ...(settledAt ? { settledAt } : {}),
    },
    update: {
      status: onChain.status,
      ...(settledAt ? { settledAt } : {}),
    },
  });
}

import type { WalletClient } from 'viem';
import { CID } from 'multiformats/cid';
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  http,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { DEALFORGE_CHAIN_ID, DEALFORGE_CONTRACT_ADDRESS } from '@/lib/config';
import { mirrorDeal } from '@/lib/api/deals';
import { getJob } from '@/lib/api/jobs';
import type { ApiProposal } from '@/lib/types/api';

const DEALFORGE_ABI = [
  {
    type: 'event',
    name: 'DealCreated',
    inputs: [
      { indexed: true, name: 'dealId', type: 'uint256' },
      { indexed: true, name: 'payer', type: 'address' },
      { indexed: true, name: 'worker', type: 'address' },
      { indexed: false, name: 'token', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'deadline', type: 'uint256' },
      { indexed: false, name: 'taskHash', type: 'bytes32' },
    ],
  },
  {
    type: 'function',
    name: 'createDeal',
    stateMutability: 'payable',
    inputs: [
      { name: 'worker', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'taskHash', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

function getActiveChain() {
  return DEALFORGE_CHAIN_ID === base.id ? base : baseSepolia;
}

function getInjectedProvider() {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as Window & { ethereum?: unknown }).ethereum ?? null;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cidToBytes32(cid: string) {
  const parsed = CID.parse(cid);
  if (parsed.multihash.code !== 0x12 || parsed.multihash.size !== 32) {
    throw new Error('Task CID must use sha2-256 with a 32-byte digest.');
  }

  const digest = parsed.multihash.digest;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `0x${hex}` as `0x${string}`;
}

function extractCreatedDeal(receipt: { logs: Array<{ data: `0x${string}`; topics: readonly `0x${string}`[] }> }) {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: DEALFORGE_ABI,
        data: log.data,
        topics: [...log.topics] as [signature: `0x${string}`, ...args: `0x${string}`[]],
      });
      if (decoded.eventName === 'DealCreated') {
        return {
          dealId: Number(decoded.args.dealId),
          payer: decoded.args.payer,
        };
      }
    } catch {
      continue;
    }
  }

  throw new Error('Could not find DealCreated event in transaction receipt.');
}

export async function createDealForAcceptedProposal({
  walletClient: _walletClient,
  agentAddress,
  jobId,
  proposal,
}: {
  walletClient: WalletClient;
  agentAddress: string;
  jobId: string;
  proposal: ApiProposal;
}) {
  if (!DEALFORGE_CONTRACT_ADDRESS) {
    throw new Error('DealForge contract address is not configured.');
  }

  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error('Injected wallet provider unavailable for createDeal().');
  }

  const job = await getJob(jobId);
  const taskCid = job.taskDescriptionCid ?? job.task_description_cid;
  if (!taskCid) {
    throw new Error('Job is missing taskDescriptionCid, so createDeal() cannot be called.');
  }

  const worker = proposal.worker_address ?? proposal.workerAddress;
  if (!worker) {
    throw new Error('Accepted proposal is missing worker address.');
  }

  const proposedPrice = proposal.proposed_price ?? proposal.proposedPrice;
  const proposedDeadline = proposal.proposed_deadline ?? proposal.proposedDeadline;
  if (!proposedPrice || proposedDeadline === undefined) {
    throw new Error('Accepted proposal is missing price or deadline.');
  }

  const publicClient = createPublicClient({
    chain: getActiveChain(),
    transport: http(),
  });

  const connectedAccount = getAddress(agentAddress);
  const walletClient = createWalletClient({
    chain: getActiveChain(),
    transport: custom(provider),
    account: connectedAccount,
  });

  const txHash = await walletClient.sendTransaction({
    account: connectedAccount,
    chain: getActiveChain(),
    to: getAddress(DEALFORGE_CONTRACT_ADDRESS),
    value: BigInt(proposedPrice),
    data: encodeFunctionData({
      abi: DEALFORGE_ABI,
      functionName: 'createDeal',
      args: [
        getAddress(worker),
        BigInt(proposedDeadline),
        cidToBytes32(taskCid),
      ],
    }),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const createdDeal = extractCreatedDeal(receipt);
  const mirrorHeaderAddress = createdDeal.payer;

  try {
    await sleep(5000);
    await mirrorDeal(
      {
        deal_id: createdDeal.dealId,
        tx_hash: txHash,
        job_id: jobId,
        task_cid: taskCid,
      },
      mirrorHeaderAddress,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown mirror error';
    console.error('Deal mirror failed', {
      connectedAccount,
      payer: createdDeal.payer,
      mirrorHeaderAddress,
      dealId: createdDeal.dealId,
      txHash,
      message,
    });
    throw new Error(
      `Mirror failed: connected=${connectedAccount} payer=${createdDeal.payer} mirror_header=${mirrorHeaderAddress} deal_id=${createdDeal.dealId} tx=${txHash}. ${message}`,
    );
  }

  return {
    dealId: createdDeal.dealId,
    txHash,
    taskCid,
    payer: createdDeal.payer,
    connectedAccount,
    mirrorHeaderAddress,
  };
}

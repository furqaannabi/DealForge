import { ethers } from 'ethers';
import { config } from '../config';
import type { Delegation } from '../services/delegation';

// ─── DelegationManager ABI ───────────────────────────────────────────────────
// Only the function we need — redeemDelegation
// Full ABI is in @metamask/delegation-framework if you need more functions

const DELEGATION_MANAGER_ABI = [
  `function redeemDelegation(
    bytes[] calldata delegations,
    bytes calldata action
  ) external`,
];

// ─── DealForge ABI ───────────────────────────────────────────────────────────
// Only settleDeal — we need this to encode the action calldata

const DEALFORGE_ABI = [
  'function settleDeal(uint256 dealId) nonpayable',
];

function getRpcUrl(): string {
  return config.NODE_ENV === 'production'
    ? config.BASE_RPC_URL
    : config.BASE_SEPOLIA_RPC_URL;
}

// ─── Encode delegation to bytes ──────────────────────────────────────────────
// DelegationManager expects each delegation as ABI-encoded bytes
// This encodes your Delegation object into the format it expects

function encodeDelegation(delegation: Delegation): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'tuple(address delegate, address delegator, bytes32 authority, tuple(address enforcer, bytes terms, bytes args)[] caveats, bytes32 salt, bytes signature)',
    ],
    [
      {
        delegate:  delegation.delegate,
        delegator: delegation.delegator,
        authority: delegation.authority,
        caveats:   delegation.caveats.map(c => ({
          enforcer: c.enforcer,
          terms:    c.terms,
          args: c.args ?? '0x',
        })),
        salt:      delegation.salt,
        signature: delegation.signature,
      },
    ],
  );
}

// ─── Main redeem function ─────────────────────────────────────────────────────
// Called by worker agent after verifier calls recordVerifierApproval()
//
// Flow:
// 1. Fetch parent + sub delegation from API
// 2. Encode settleDeal(dealId) as the action
// 3. Call DelegationManager.redeemDelegation()
// 4. DelegationManager checks all caveats
// 5. If all pass → DelegationManager calls DealForge.settleDeal(dealId)
// 6. Funds sent to worker

export async function redeemDelegation(
  dealId:      string,
  proposalId:  string,
  workerAddress: string,
): Promise<string> {
  if (!config.API_BASE_URL) {
    throw new Error('API_BASE_URL not set');
  }
  if (!config.WORKER_PRIVATE_KEY) {
    throw new Error('WORKER_PRIVATE_KEY not set');
  }
  // ── Step 1: Fetch delegations from API ──────────────────────────────────
  // Parent delegation — signed by user when they posted the job
  const parentRes = await fetch(
    `${config.API_BASE_URL}/jobs/${dealId}/delegation`,
    { headers: { 'x-agent-address': workerAddress } },
  );
  if (!parentRes.ok) {
    throw new Error(`Failed to fetch parent delegation for job ${dealId}`);
  }
  const { delegation: parentDelegation } = await parentRes.json() as { delegation: Delegation };

  // Sub-delegation — signed by task agent after negotiation accepted
  const subRes = await fetch(
    `${config.API_BASE_URL}/jobs/${dealId}/proposals/${proposalId}/subdelegation`,
    { headers: { 'x-agent-address': workerAddress } },
  );
  if (!subRes.ok) {
    throw new Error(`Failed to fetch sub-delegation for proposal ${proposalId}`);
  }
  const { subDelegation } = await subRes.json() as { subDelegation: Delegation };

  // ── Step 2: Encode the action ────────────────────────────────────────────
  // This tells DelegationManager what to call on DealForge after caveats pass
  // DelegationManager will call DealForge.settleDeal(dealId) as msg.sender
  const dealForgeInterface = new ethers.Interface(DEALFORGE_ABI);
  const action = dealForgeInterface.encodeFunctionData('settleDeal', [BigInt(dealId)]);

  // ── Step 3: Encode delegations as bytes ──────────────────────────────────
  // DelegationManager expects an array of ABI-encoded delegation bytes
  // Order matters: [parent, sub] — parent first, sub second
  const encodedDelegations = [
    encodeDelegation(parentDelegation),
    encodeDelegation(subDelegation),
  ];

  // ── Step 4: Connect worker wallet ────────────────────────────────────────
  // Worker agent signs the redemption tx — they are msg.sender
  // DelegationManager checks: sub.delegate == msg.sender (worker)
  const provider = new ethers.JsonRpcProvider(getRpcUrl());
  const workerWallet = new ethers.Wallet(config.WORKER_PRIVATE_KEY, provider);

  // ── Step 5: Call DelegationManager.redeemDelegation() ───────────────────
  // DelegationManager internally:
  //   1. Verifies parent signature  → was signed by user wallet
  //   2. Verifies sub signature     → was signed by task agent wallet
  //   3. Checks sub.authority       → matches hash of parent
  //   4. Checks sub.delegate        → matches msg.sender (worker)
  //   5. Calls VerifierVoteCaveat.enforceCaveat() → verifierApproved[dealId] == true
  //   6. Calls IPFSResultCaveat.enforceCaveat()   → resultHash != bytes32(0)
  //   7. All pass → executes action → DealForge.settleDeal(dealId)
  //   8. DealForge sends funds to worker
  const delegationManager = new ethers.Contract(
    config.DELEGATION_MANAGER_ADDRESS,
    DELEGATION_MANAGER_ABI,
    workerWallet,
  );

  console.log(`[redeemer] Redeeming delegation for deal #${dealId}...`);

  const tx: ethers.ContractTransactionResponse = await delegationManager.redeemDelegation(
    encodedDelegations,
    action,
  );

  const receipt = await tx.wait();

  console.log(`[redeemer] deal #${dealId} settled via delegation. tx: ${receipt?.hash}`);

  return receipt?.hash ?? tx.hash;
}

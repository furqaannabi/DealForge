/**
 * VoteClient — submits the verifier's decision on-chain.
 *
 * Current contract permissions:
 *   settleDeal(dealId)  → payer || owner       ← ACCEPT uses this
 *   raiseDispute(dealId)→ payer only            ← REJECT path needs Phase 5
 *
 * For the v1 demo the verifier wallet must be the contract owner.
 * Phase 5 will add verifierSettle/verifierReject with staking + N-of-M voting.
 */

import { ethers } from 'ethers';
import { config } from './config';
import { VoteDecision } from './engine/types';

const ABI = [
  'function settleDeal(uint256 dealId) nonpayable',
  'function raiseDispute(uint256 dealId) nonpayable',
];

function getWalletAndContract(): { wallet: ethers.Wallet; contract: ethers.Contract } {
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
  const contract = new ethers.Contract(config.CONTRACT_ADDRESS, ABI, wallet);
  return { wallet, contract };
}

export async function submitVote(dealId: bigint, decision: VoteDecision): Promise<string> {
  const { wallet, contract } = getWalletAndContract();

  console.log(`[vote] deal #${dealId} → ${decision} (wallet: ${wallet.address})`);

  if (decision === 'ACCEPT') {
    const tx: ethers.ContractTransactionResponse = await contract.settleDeal(dealId);
    const receipt = await tx.wait();
    console.log(`[vote] settleDeal tx: ${receipt?.hash}`);
    return receipt?.hash ?? tx.hash;
  }

  // REJECT — call raiseDispute.
  // NOTE: The current contract only allows the payer to raise a dispute.
  // This call will succeed when the verifier wallet IS the payer, or once
  // Phase 5 adds owner-callable verifierReject(dealId) to the contract.
  try {
    const tx: ethers.ContractTransactionResponse = await contract.raiseDispute(dealId);
    const receipt = await tx.wait();
    console.log(`[vote] raiseDispute tx: ${receipt?.hash}`);
    return receipt?.hash ?? tx.hash;
  } catch (err) {
    // Log and surface — do not silently swallow a rejection
    console.error(
      `[vote] REJECT for deal #${dealId} could not be submitted on-chain: ${String(err)}`,
    );
    console.error('[vote] Phase 5 contract update required for owner-initiated rejection.');
    throw err;
  }
}

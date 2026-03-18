/**
 * VoteClient — submits the verifier's decision on-chain.
 *
 * Updated for MetaMask Delegation integration:
 *   ACCEPT → recordVerifierApproval(dealId)  ← marks approval, delegation handles settlement
 *   REJECT → raiseDispute(dealId)            ← unchanged
 */

import { ethers } from 'ethers';
import { config } from './config';
import { VoteDecision } from './engine/types';

const ABI = [
  'function vote(uint256 dealId, bool accept) nonpayable',  // NEW
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
    // Previously called settleDeal() directly.
    // Now we just record approval — the worker's delegation redemption
    // triggers settlement automatically via DelegationManager.
    const tx: ethers.ContractTransactionResponse = await contract.vote(dealId, decision === 'ACCEPT');
    const receipt = await tx.wait();
    console.log(`[vote] recordVerifierApproval tx: ${receipt?.hash}`);
    return receipt?.hash ?? tx.hash;
  }

  // REJECT — unchanged
  try {
    const tx: ethers.ContractTransactionResponse = await contract.raiseDispute(dealId);
    const receipt = await tx.wait();
    console.log(`[vote] raiseDispute tx: ${receipt?.hash}`);
    return receipt?.hash ?? tx.hash;
  } catch (err) {
    console.error(
      `[vote] REJECT for deal #${dealId} could not be submitted on-chain: ${String(err)}`,
    );
    throw err;
  }
}
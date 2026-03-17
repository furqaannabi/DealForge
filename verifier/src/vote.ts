/**
 * VoteClient — submits the verifier's decision on-chain via the Phase 5
 * vote(dealId, accept) function. Requires the verifier wallet to be staked
 * (stakeVerifier() called once at setup). Consensus auto-settles or
 * auto-disputes once requiredVotes threshold is met.
 */

import { ethers } from 'ethers';
import { config } from './config';
import { VoteDecision } from './engine/types';

const ABI = [
  'function vote(uint256 dealId, bool accept) nonpayable',
  'function isVerifier(address addr) view returns (bool)',
];

function getWalletAndContract(): { wallet: ethers.Wallet; contract: ethers.Contract } {
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
  const contract = new ethers.Contract(config.CONTRACT_ADDRESS, ABI, wallet);
  return { wallet, contract };
}

export async function submitVote(dealId: bigint, decision: VoteDecision): Promise<string> {
  const { wallet, contract } = getWalletAndContract();
  const accept = decision === 'ACCEPT';

  console.log(`[vote] deal #${dealId} → ${decision} (wallet: ${wallet.address})`);

  const tx: ethers.ContractTransactionResponse = await contract.vote(dealId, accept);
  const receipt = await tx.wait();
  console.log(`[vote] vote(${accept}) tx: ${receipt?.hash}`);
  return receipt?.hash ?? tx.hash;
}

/**
 * StakeManager — ensures this verifier wallet is registered on DealForge.sol
 * before the listener starts. Calls stakeVerifier() with 0.01 ETH if not already staked.
 */

import { ethers } from 'ethers';
import { config } from './config';

const STAKE_AMOUNT = ethers.parseEther('0.01');

const ABI = [
  'function isVerifier(address) view returns (bool)',
  'function stakeVerifier() payable',
];

export async function ensureStaked(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
  const contract = new ethers.Contract(config.CONTRACT_ADDRESS, ABI, wallet);

  console.log(`[stake] Checking registration for ${wallet.address}…`);

  const already = await contract.isVerifier(wallet.address) as boolean;
  if (already) {
    console.log('[stake] Already registered as verifier ✅');
    return;
  }

  const balance = await provider.getBalance(wallet.address);
  if (balance < STAKE_AMOUNT) {
    console.error(
      `[stake] Insufficient balance to stake: have ${ethers.formatEther(balance)} ETH, need 0.01 ETH`,
    );
    return;
  }

  console.log('[stake] Not registered — staking 0.01 ETH…');
  const tx: ethers.ContractTransactionResponse = await contract.stakeVerifier({ value: STAKE_AMOUNT });
  const receipt = await tx.wait();
  console.log(`[stake] Staked ✅  tx: ${receipt?.hash}`);
}

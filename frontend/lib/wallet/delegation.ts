import { ethers } from 'ethers';
import {
  ROOT_AUTHORITY,
  createCaveat,
  createDelegation,
  getSmartAccountsEnvironment,
  type Delegation,
} from '@metamask/smart-accounts-kit';
import type { WalletClient } from 'viem';
import {
  DEALFORGE_AGENT_ADDRESS,
  DEALFORGE_CHAIN_ID,
  DEALFORGE_CONTRACT_ADDRESS,
  IPFS_CAVEAT_ADDRESS,
  VERIFIER_CAVEAT_ADDRESS,
} from '@/lib/config';

const DEALFORGE_INTERFACE = new ethers.Interface(['function settleDeal(uint256 dealId)']);

function encodeJobIntentTerms(jobId: string): `0x${string}` {
  return ethers.AbiCoder.defaultAbiCoder().encode(['string'], [jobId]) as `0x${string}`;
}

function buildIntentCaveats(jobId: string) {
  const terms = encodeJobIntentTerms(jobId);
  const caveats = [];

  if (VERIFIER_CAVEAT_ADDRESS) {
    caveats.push(createCaveat(VERIFIER_CAVEAT_ADDRESS as `0x${string}`, terms));
  }

  if (IPFS_CAVEAT_ADDRESS) {
    caveats.push(createCaveat(IPFS_CAVEAT_ADDRESS as `0x${string}`, terms));
  }

  return caveats;
}

export function canSignDelegation() {
  return Boolean(DEALFORGE_AGENT_ADDRESS && DEALFORGE_CONTRACT_ADDRESS);
}

function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export async function signSettlementDelegation(jobId: string, userAddress: string, walletClient: WalletClient) {
  if (!canSignDelegation()) {
    console.warn('Delegation signing not configured');
    return null;
  }

  if (!userAddress || !isValidAddress(userAddress)) {
    console.error(`Invalid user address: ${userAddress}`);
    return null;
  }

  const environment = getSmartAccountsEnvironment(DEALFORGE_CHAIN_ID);
  const unsignedDelegation = createDelegation({
    environment,
    from: userAddress as `0x${string}`,
    to: DEALFORGE_AGENT_ADDRESS as `0x${string}`,
    parentDelegation: ROOT_AUTHORITY,
    scope: {
      type: 'functionCall',
      targets: [DEALFORGE_CONTRACT_ADDRESS as `0x${string}`],
      selectors: [DEALFORGE_INTERFACE.getFunction('settleDeal')!.selector as `0x${string}`],
    },
    caveats: buildIntentCaveats(jobId),
  });

  const delegationManagerAddress = environment.DelegationManager as `0x${string}`;
  const { signature: _ignoredSignature, ...signableDelegation } = unsignedDelegation;

  const signature = await walletClient.signTypedData({
    account: userAddress as `0x${string}`,
    domain: {
      name: 'DelegationManager',
      version: '1',
      chainId: DEALFORGE_CHAIN_ID,
      verifyingContract: delegationManagerAddress,
    },
    types: {
      Delegation: [
        { name: 'delegate', type: 'address' },
        { name: 'delegator', type: 'address' },
        { name: 'authority', type: 'bytes32' },
        { name: 'caveats', type: 'Caveat[]' },
        { name: 'salt', type: 'uint256' },
      ],
      Caveat: [
        { name: 'enforcer', type: 'address' },
        { name: 'terms', type: 'bytes' },
        { name: 'args', type: 'bytes' },
      ],
    },
    primaryType: 'Delegation',
    message: signableDelegation as never,
  });

  return {
    delegation: {
      ...unsignedDelegation,
      signature,
    } as Delegation,
    delegationManagerAddress,
  };
}

export function formatDelegationPreview(delegation: Delegation) {
  return JSON.stringify(delegation, null, 2);
}

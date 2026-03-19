import { ethers } from 'ethers';
import {
  ROOT_AUTHORITY,
  createDelegation,
  getSmartAccountsEnvironment,
  type Delegation,
} from '@metamask/smart-accounts-kit';
import type { WalletClient } from 'viem';
import {
  DEALFORGE_AGENT_ADDRESS,
  DEALFORGE_CHAIN_ID,
  DEALFORGE_CONTRACT_ADDRESS,
} from '@/lib/config';

const DEALFORGE_INTERFACE = new ethers.Interface(['function settleDeal(uint256 dealId)']);

export function canSignDelegation() {
  return Boolean(DEALFORGE_AGENT_ADDRESS && DEALFORGE_CONTRACT_ADDRESS);
}

export async function signSettlementDelegation(userAddress: string, walletClient: WalletClient) {
  if (!canSignDelegation()) {
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
  });

  const delegationManagerAddress = environment.DelegationManager as `0x${string}`;
  const { signature: _ignoredSignature, ...signableDelegation } = unsignedDelegation;

  const signature = await walletClient.signTypedData({
    account: walletClient.account!,
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

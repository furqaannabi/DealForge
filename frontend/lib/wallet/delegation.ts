import {
  Implementation,
  ROOT_AUTHORITY,
  createDelegation,
  getSmartAccountsEnvironment,
  toMetaMaskSmartAccount,
  type Delegation,
} from '@metamask/smart-accounts-kit';
import type { ApiDelegation } from '@/lib/types/api';
import { createPublicClient, createWalletClient, custom, getAddress, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { DEALFORGE_CHAIN_ID } from '@/lib/config';

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
};

export function canSignDelegation(delegateAddress?: string) {
  return Boolean(delegateAddress);
}

function getActiveChain() {
  return DEALFORGE_CHAIN_ID === base.id ? base : baseSepolia;
}

function getInjectedProvider() {
  if (typeof window === 'undefined') {
    return null;
  }

  return ((window as Window & { ethereum?: Eip1193Provider }).ethereum ?? null);
}

async function assertOwnerEoaAddress(ownerAddress: `0x${string}`) {
  const publicClient = createPublicClient({
    chain: getActiveChain(),
    transport: http(),
  });

  const deployedCode = await publicClient.getCode({ address: ownerAddress });
  if (deployedCode && deployedCode !== '0x') {
    throw new Error(
      'Connect the EOA owner account in MetaMask. DealForge derives a MetaMask smart account from that owner, so the connected address cannot already be a contract account.',
    );
  }
}

function serializeDelegation(delegation: Delegation): ApiDelegation {
  return {
    delegate: delegation.delegate,
    delegator: delegation.delegator,
    authority: delegation.authority,
    caveats: delegation.caveats.map((caveat) => ({
      enforcer: caveat.enforcer,
      terms: caveat.terms,
      args: caveat.args,
    })),
    salt: delegation.salt.toString(),
    signature: delegation.signature,
  };
}

export async function signEscrowFundingDelegation({
  userAddress,
  delegateAddress,
  maxAmountWei,
}: {
  userAddress: string;
  delegateAddress: string;
  maxAmountWei: bigint;
}) {
  if (!canSignDelegation(delegateAddress)) {
    return null;
  }

  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error('Injected wallet provider not available for delegation signing.');
  }

  const ownerAddress = getAddress(userAddress);
  await assertOwnerEoaAddress(ownerAddress);

  const chain = getActiveChain();
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });
  const ownerWalletClient = createWalletClient({
    account: ownerAddress,
    chain,
    transport: custom(provider),
  });

  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient as never,
    implementation: Implementation.Hybrid,
    signer: { walletClient: ownerWalletClient as never },
    deployParams: [ownerAddress, [], [], []] as never,
    deploySalt: '0x',
  } as never);

  const environment = getSmartAccountsEnvironment(DEALFORGE_CHAIN_ID);

  const delegation = createDelegation({
    environment,
    from: smartAccount.address,
    to: delegateAddress as `0x${string}`,
    parentDelegation: ROOT_AUTHORITY,
    scope: {
      type: 'nativeTokenTransferAmount',
      maxAmount: maxAmountWei,
    },
  });

  const signature = await smartAccount.signDelegation({ delegation });
  const signedDelegation: Delegation = {
    ...delegation,
    signature,
  };

  return {
    delegation: serializeDelegation(signedDelegation),
    delegationManagerAddress: smartAccount.environment.DelegationManager,
    smartAccountAddress: smartAccount.address,
    maxAmountWei: maxAmountWei.toString(),
  };
}

export function formatDelegationPreview(delegation: ApiDelegation) {
  return JSON.stringify(delegation, null, 2);
}

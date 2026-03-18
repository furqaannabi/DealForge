import { ethers } from 'ethers';
import {
  ROOT_AUTHORITY,
  createCaveat,
  createDelegation,
  getSmartAccountsEnvironment,
  signDelegation,
  type Delegation,
} from '@metamask/smart-accounts-kit';
import { config } from '../config';
import type { CaveatParams } from '../types';

const DEALFORGE_INTERFACE = new ethers.Interface([
  'function settleDeal(uint256 dealId) nonpayable',
]);

function getDelegationChainId(): 8453 | 84532 {
  return config.NODE_ENV === 'production' ? 8453 : 84532;
}

function getDelegationEnvironment() {
  return getSmartAccountsEnvironment(getDelegationChainId());
}

function getDealForgeScope() {
  if (!config.DEALFORGE_CONTRACT_ADDRESS) {
    throw new Error('DEALFORGE_CONTRACT_ADDRESS not set in config');
  }

  return {
    type: 'functionCall' as const,
    targets: [config.DEALFORGE_CONTRACT_ADDRESS as `0x${string}`],
    selectors: [DEALFORGE_INTERFACE.getFunction('settleDeal')!.selector as `0x${string}`],
  };
}

function encodeDealIdTerms(dealId: string): `0x${string}` {
  return ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [BigInt(dealId)]) as `0x${string}`;
}

function buildCustomCaveats(
  dealId: string,
  verifierCaveatAddress: string,
  ipfsCaveatAddress: string,
) {
  const terms = encodeDealIdTerms(dealId);

  return [
    createCaveat(verifierCaveatAddress as `0x${string}`, terms),
    createCaveat(ipfsCaveatAddress as `0x${string}`, terms),
  ];
}

export type { Delegation } from '@metamask/smart-accounts-kit';

export function buildParentDelegation(
  delegatorAddress: string,
  agentAddress: string,
  dealId: string,
  verifierCaveatAddress: string,
  ipfsCaveatAddress: string,
): Delegation {
  return createDelegation({
    environment: getDelegationEnvironment(),
    from: delegatorAddress as `0x${string}`,
    to: agentAddress as `0x${string}`,
    scope: getDealForgeScope(),
    parentDelegation: ROOT_AUTHORITY,
    caveats: buildCustomCaveats(dealId, verifierCaveatAddress, ipfsCaveatAddress),
  });
}

export async function buildSubDelegation(
  parentDelegation: Delegation,
  workerAddress: string,
  dealId: string,
  _caveatParams: CaveatParams,
  verifierCaveatAddress: string,
  ipfsCaveatAddress: string,
): Promise<Delegation> {
  if (!config.AGENT_PRIVATE_KEY) {
    throw new Error('AGENT_PRIVATE_KEY not set in config');
  }

  const agentWallet = new ethers.Wallet(config.AGENT_PRIVATE_KEY);
  const unsignedDelegation = createDelegation({
    environment: getDelegationEnvironment(),
    from: agentWallet.address as `0x${string}`,
    to: workerAddress as `0x${string}`,
    scope: getDealForgeScope(),
    parentDelegation,
    caveats: buildCustomCaveats(dealId, verifierCaveatAddress, ipfsCaveatAddress),
  });

  const { signature: _signature, ...signableDelegation } = unsignedDelegation;
  const signature = await signDelegation({
    privateKey: config.AGENT_PRIVATE_KEY as `0x${string}`,
    delegation: signableDelegation,
    delegationManager: config.DELEGATION_MANAGER_ADDRESS as `0x${string}`,
    chainId: getDelegationChainId(),
  });

  return {
    ...unsignedDelegation,
    signature,
  };
}

export async function createSubDelegation(params: {
  parentDelegation: Delegation;
  workerAddress: string;
  dealId: string;
  caveatParams: CaveatParams;
}): Promise<Delegation> {
  const verifierCaveatAddress = config.VERIFIER_CAVEAT_ADDRESS;
  const ipfsCaveatAddress = config.IPFS_CAVEAT_ADDRESS;

  if (!verifierCaveatAddress || !ipfsCaveatAddress) {
    throw new Error('VERIFIER_CAVEAT_ADDRESS or IPFS_CAVEAT_ADDRESS not set in config');
  }

  return buildSubDelegation(
    params.parentDelegation,
    params.workerAddress,
    params.dealId,
    params.caveatParams,
    verifierCaveatAddress,
    ipfsCaveatAddress,
  );
}

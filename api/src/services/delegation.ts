import { ethers } from 'ethers';
import { config } from '../config';
import type { CaveatParams } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DelegationCaveat {
  enforcer: string;
  terms: string;
}

export interface Delegation {
  delegate:  string;
  delegator: string;
  authority: string;
  caveats:   DelegationCaveat[];
  salt:      string;
  signature: string;
}

// ─── EIP-712 domain + types ──────────────────────────────────────────────────
// Must match exactly what MetaMask DelegationManager expects on-chain

const DOMAIN = {
  name:    'DealForge',
  version: '1',
  chainId: 8453, // Base mainnet — use 84532 for Base Sepolia
};

const DELEGATION_TYPES = {
  Delegation: [
    { name: 'delegate',  type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'authority', type: 'bytes32' },
    { name: 'salt',      type: 'bytes32' },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Encodes dealId as the caveat terms
// Both caveat contracts decode this as: uint256 dealId = abi.decode(terms, (uint256))
function encodeDealIdTerms(dealId: string): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [BigInt(dealId)]);
}

// Builds the two caveats used on every delegation in DealForge:
// 1. VerifierVoteCaveat  — verifierApproved[dealId] must be true
// 2. IPFSResultCaveat    — deals[dealId].resultHash must be non-zero
function buildCaveats(
  dealId: string,
  verifierCaveatAddress: string,
  ipfsCaveatAddress: string,
): DelegationCaveat[] {
  const terms = encodeDealIdTerms(dealId);
  return [
    { enforcer: verifierCaveatAddress, terms },
    { enforcer: ipfsCaveatAddress,     terms },
  ];
}

// Computes the EIP-712 hash of a delegation object
// This hash is used as the authority field in sub-delegations
export function getDelegationHash(delegation: Delegation): string {
  return ethers.TypedDataEncoder.hash(
    DOMAIN,
    DELEGATION_TYPES,
    {
      delegate:  delegation.delegate,
      delegator: delegation.delegator,
      authority: delegation.authority,
      salt:      delegation.salt,
    },
  );
}

// ─── Build parent delegation ─────────────────────────────────────────────────
// Called when user posts a job.
// Returns an UNSIGNED delegation object — the frontend signs it via MetaMask.
// authority = ZeroHash means this is a root delegation signed directly by the user.

export function buildParentDelegation(
  delegatorAddress:      string,  // user's MetaMask wallet
  agentAddress:          string,  // task agent wallet — acts on user's behalf
  dealId:                string,
  verifierCaveatAddress: string,
  ipfsCaveatAddress:     string,
): Delegation {
  return {
    delegate:  agentAddress,
    delegator: delegatorAddress,
    authority: ethers.ZeroHash,  // root delegation
    caveats:   buildCaveats(dealId, verifierCaveatAddress, ipfsCaveatAddress),
    salt:      ethers.hexlify(ethers.randomBytes(32)),
    signature: '0x', // filled in by frontend after MetaMask signs
  };
}

// ─── Build sub-delegation ────────────────────────────────────────────────────
// Called by task agent after NegotiationEngine accepts a proposal.
// Narrows the parent delegation to a specific worker at a specific agreed price.
// authority = hash of parent delegation — this is what makes it a sub-delegation.
// Signed by the task agent's private key (server-side, not MetaMask).

export async function buildSubDelegation(
  parentDelegation:      Delegation,   // the parent signed by user
  workerAddress:         string,        // winning worker agent wallet
  dealId:                string,
  caveatParams:          CaveatParams,
  verifierCaveatAddress: string,
  ipfsCaveatAddress:     string,
): Promise<Delegation> {

  // Hash of parent — links this sub-delegation to the parent chain
  const parentHash = getDelegationHash(parentDelegation);

  // Task agent wallet — signs the sub-delegation server-side
  const agentWallet = new ethers.Wallet(config.AGENT_PRIVATE_KEY!);

  const subDelegation: Delegation = {
    delegate:  workerAddress,
    delegator: agentWallet.address, // task agent is the delegator here
    authority: parentHash,           // references parent — makes it a sub-delegation
    caveats:   buildCaveats(dealId, verifierCaveatAddress, ipfsCaveatAddress),
    salt:      ethers.hexlify(ethers.randomBytes(32)),
    signature: '0x', // filled below
  };

  // Sign with task agent's private key using EIP-712
  subDelegation.signature = await agentWallet.signTypedData(
    DOMAIN,
    DELEGATION_TYPES,
    {
      delegate:  subDelegation.delegate,
      delegator: subDelegation.delegator,
      authority: subDelegation.authority,
      salt:      subDelegation.salt,
    },
  );

  return subDelegation;
}

// ─── Create sub-delegation ───────────────────────────────────────────────────
// This is the function called from jobs.ts after proposal is accepted.
// Wraps buildSubDelegation with the env var addresses.

export async function createSubDelegation(params: {
  parentDelegation: Delegation;
  workerAddress:    string;
  dealId:           string;
  caveatParams:     CaveatParams;
}): Promise<Delegation> {

  const verifierCaveatAddress = config.VERIFIER_CAVEAT_ADDRESS;
  const ipfsCaveatAddress     = config.IPFS_CAVEAT_ADDRESS;

  if (!verifierCaveatAddress || !ipfsCaveatAddress) {
    throw new Error('VERIFIER_CAVEAT_ADDRESS or IPFS_CAVEAT_ADDRESS not set in config');
  }

  if (!config.AGENT_PRIVATE_KEY) {
    throw new Error('AGENT_PRIVATE_KEY not set in config');
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

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

export const DEMO_AGENT_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_ADDRESS ?? '0x000000000000000000000000000000000000dEaD';

export const DEALFORGE_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEALFORGE_CHAIN_ID ?? '84532');

export const DEALFORGE_CHAIN_NAME =
  process.env.NEXT_PUBLIC_DEALFORGE_CHAIN_NAME ?? 'Base Sepolia';

export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'demo';

export const DEALFORGE_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_DEALFORGE_CONTRACT_ADDRESS ?? '';

export const DEALFORGE_SETTLEMENT_SELECTOR = 'settleDeal(uint256)';

export const DEALFORGE_AGENT_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_ADDRESS ?? '0x000000000000000000000000000000000000dEaD';

export const VERIFIER_CAVEAT_ADDRESS =
  process.env.NEXT_PUBLIC_VERIFIER_CAVEAT_ADDRESS ?? '';

export const IPFS_CAVEAT_ADDRESS =
  process.env.NEXT_PUBLIC_IPFS_CAVEAT_ADDRESS ?? '';

export const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY?.replace(/\/$/, '') ?? 'https://ipfs.filebase.io/ipfs';

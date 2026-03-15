export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

export const DEMO_AGENT_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_ADDRESS ?? '0x000000000000000000000000000000000000dEaD';

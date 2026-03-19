/**
 * IPFSClient — fetches task descriptions and results from IPFS.
 *
 * Uses Pinata SDK (with JWT) when PINATA_JWT is configured, otherwise
 * falls back to a raw HTTP GET against IPFS_GATEWAY.
 *
 * The contract stores taskHash / resultHash as bytes32 (raw SHA2-256 digest).
 * This module reconstructs the CIDv0 (Qm...) from bytes32 before fetching.
 */

import { config } from './config';
import { TaskDescription, TaskResult } from './engine/types';

// ─── bytes32 → CIDv0 ─────────────────────────────────────────────────────────

const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buffer: Uint8Array): string {
  let num = BigInt('0x' + Buffer.from(buffer).toString('hex'));
  let result = '';
  const base = BigInt(58);
  while (num > 0n) {
    result = BASE58_CHARS[Number(num % base)] + result;
    num /= base;
  }
  for (const byte of buffer) {
    if (byte !== 0) break;
    result = '1' + result;
  }
  return result;
}

function bytes32ToCid(bytes32: string): string {
  const hex = bytes32.startsWith('0x') ? bytes32.slice(2) : bytes32;
  const multihash = Buffer.from('1220' + hex, 'hex');
  return base58Encode(multihash);
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchByCid<T>(cid: string): Promise<T> {
  const url = `https://ipfs.io/ipfs/${cid}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`IPFS gateway error ${res.status} for CID ${cid}`);
  return res.json() as Promise<T>;
}

export async function fetchTask(taskHashBytes32: string): Promise<TaskDescription> {
  const cid = bytes32ToCid(taskHashBytes32);
  return fetchByCid<TaskDescription>(cid);
}

export async function fetchResult(resultHashBytes32: string, dealId?: bigint): Promise<TaskResult> {
  // Get the stored CIDv1 from the API DB (avoids CIDv0/v1 mismatch)
  if (config.API_BASE_URL && dealId !== undefined) {
    try {
      const res = await fetch(`${config.API_BASE_URL}/deals/${dealId}`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const deal = await res.json() as { resultCid?: string };
        if (deal.resultCid) return fetchByCid<TaskResult>(deal.resultCid);
      }
    } catch {
      // fall through
    }
  }
  const cid = bytes32ToCid(resultHashBytes32);
  return fetchByCid<TaskResult>(cid);
}

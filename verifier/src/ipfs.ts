/**
 * IPFSClient — fetches task descriptions and results from IPFS.
 *
 * The contract stores taskHash / resultHash as bytes32. These are the raw
 * SHA2-256 digest of the IPFS content (last 32 bytes of a CIDv0 multihash).
 * This module reconstructs the CIDv0 (Qm...) from bytes32 and fetches via
 * the configured gateway.
 */

import { config } from './config';
import { TaskDescription, TaskResult } from './engine/types';

// ─── bytes32 → CIDv0 ─────────────────────────────────────────────────────────
// CIDv0 multihash = 0x1220 (sha2-256 function code + digest length) + 32 bytes

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
  // Strip 0x prefix
  const hex = bytes32.startsWith('0x') ? bytes32.slice(2) : bytes32;
  // Prepend multihash header: 0x1220 = sha2-256, 32-byte digest
  const multihash = Buffer.from('1220' + hex, 'hex');
  return base58Encode(multihash);
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchFromGateway<T>(cid: string): Promise<T> {
  const url = `${config.IPFS_GATEWAY}/ipfs/${cid}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`IPFS gateway error ${res.status} for CID ${cid}`);
  return res.json() as Promise<T>;
}

export async function fetchTask(taskHashBytes32: string): Promise<TaskDescription> {
  const cid = bytes32ToCid(taskHashBytes32);
  return fetchFromGateway<TaskDescription>(cid);
}

export async function fetchResult(resultHashBytes32: string): Promise<TaskResult> {
  const cid = bytes32ToCid(resultHashBytes32);
  return fetchFromGateway<TaskResult>(cid);
}

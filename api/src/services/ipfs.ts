/**
 * IPFSClient — Pinata-backed storage for DealForge task descriptions and results.
 *
 * Task descriptions are uploaded by the Task Agent before createDeal().
 * Their CID becomes the taskHash committed to the smart contract.
 *
 * Results are uploaded by the Worker Agent on completion.
 * Their CID becomes the resultHash submitted on-chain.
 */

import { PinataSDK } from 'pinata';
import { config } from '../config';

const pinata = new PinataSDK({
  pinataJwt: config.PINATA_JWT,
  pinataGateway: config.PINATA_GATEWAY,
});

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaskDescription {
  task: string;
  format: string;
  constraints: string[];
  metadata: Record<string, unknown>;
}

export interface TaskResult {
  output: unknown;
  logs: string[];
  metrics: Record<string, unknown>;
  timestamp: string;
}

export interface UploadResult {
  cid: string;
  url: string;
  size: number;
}

// ─── Upload JSON ─────────────────────────────────────────────────────────────

async function uploadJson(data: unknown, filename: string, group?: string): Promise<UploadResult> {
  const file = new File(
    [JSON.stringify(data)],
    filename,
    { type: 'application/json' },
  );

  const upload = await pinata.upload.public.file(file, group ? { groupId: group } : undefined);

  const url = await pinata.gateways.public.convert(upload.cid);

  return {
    cid: upload.cid,
    url,
    size: upload.size,
  };
}

// ─── Task description ─────────────────────────────────────────────────────────

export async function uploadTaskDescription(
  jobId: string,
  description: TaskDescription,
): Promise<UploadResult> {
  return uploadJson(description, `task-${jobId}.json`);
}

// ─── Task result ──────────────────────────────────────────────────────────────

export async function uploadTaskResult(
  jobId: string,
  result: TaskResult,
): Promise<UploadResult> {
  return uploadJson(
    { ...result, timestamp: result.timestamp ?? new Date().toISOString() },
    `result-${jobId}.json`,
  );
}

// Upload raw worker result (any JSON) keyed by dealId
export async function uploadRawResult(
  dealId: bigint | string,
  data: unknown,
): Promise<UploadResult> {
  return uploadJson(data, `result-deal-${dealId}.json`);
}

// ─── Negotiation log ──────────────────────────────────────────────────────────

export async function uploadNegotiationLog(
  jobId: string,
  messages: unknown[],
): Promise<UploadResult> {
  return uploadJson(messages, `negotiation-${jobId}.json`);
}

// ─── Retrieve content by CID ──────────────────────────────────────────────────

export async function fetchByCid<T = unknown>(cid: string): Promise<T> {
  const gatewayBase = config.PINATA_GATEWAY
    ? `https://${config.PINATA_GATEWAY}`
    : 'https://gateway.pinata.cloud';
  const url = `${gatewayBase}/ipfs/${cid}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.PINATA_JWT}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Pinata gateway ${res.status} for CID ${cid}`);
  return res.json() as Promise<T>;
}

// ─── Get public gateway URL for a CID ────────────────────────────────────────

export async function cidToUrl(cid: string): Promise<string> {
  return pinata.gateways.public.convert(cid);
}

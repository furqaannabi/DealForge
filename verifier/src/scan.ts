/**
 * Startup scan — fetches all SUBMITTED deals from the API and runs the
 * verification pipeline on each. Ensures deals submitted before this node
 * started are not missed.
 */

import { ethers } from 'ethers';
import { config } from './config';
import { processSubmittedDeal } from './listener';

export async function scanExistingDeals(): Promise<void> {
  if (!config.API_BASE_URL) {
    console.log('[scan] API_BASE_URL not set — skipping startup scan');
    return;
  }

  let deals: { dealId: string }[] = [];

  try {
    const res = await fetch(
      `${config.API_BASE_URL}/deals?status=SUBMITTED&limit=50`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) {
      console.warn(`[scan] API returned ${res.status} — skipping startup scan`);
      return;
    }
    const body = await res.json() as { deals: { dealId: string }[] };
    deals = body.deals ?? [];
  } catch (err) {
    console.warn('[scan] Could not reach API — skipping startup scan:', err);
    return;
  }

  if (deals.length === 0) {
    console.log('[scan] No SUBMITTED deals found');
    return;
  }

  console.log(`[scan] Found ${deals.length} SUBMITTED deal(s) — processing…`);

  const provider = new ethers.JsonRpcProvider(config.RPC_URL);

  await Promise.allSettled(
    deals.map((d) => processSubmittedDeal(BigInt(d.dealId), provider)),
  );

  console.log('[scan] Startup scan complete');
}

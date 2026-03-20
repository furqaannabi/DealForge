import { Router } from 'express';
import { z } from 'zod';
import { DealStatus, JobStatus } from '../../generated/prisma/client';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { getDealOnChain, syncDealToDb } from '../services/contract';
import { uploadRawResult } from '../services/ipfs';
import { config } from '../config';

const router = Router();

// ─── Validation schemas ──────────────────────────────────────────────────────

const mirrorDealSchema = z.object({
  deal_id: z.number().int().nonnegative(),
  tx_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be a valid tx hash'),
  job_id: z.string().optional(),
  task_cid: z.string().optional(), // explicit CID when not going through job flow
});

const delegationSchema = z.object({
  delegate: z.string(),
  delegator: z.string(),
  authority: z.string(),
  caveats: z.array(z.object({
    enforcer: z.string(),
    terms: z.string(),
    args: z.string().optional(),
  })),
  salt: z.string(),
  signature: z.string(),
});

// ─── GET /deals — List deals (from DB) ───────────────────────────────────────

router.get('/', async (req, res) => {
  const { status, payer, worker, limit = '20', offset = '0' } = req.query as Record<string, string>;

  const where = {
    ...(status ? { status: status as DealStatus } : {}),
    ...(payer ? { payer: payer.toLowerCase() } : {}),
    ...(worker ? { worker: worker.toLowerCase() } : {}),
  };

  const [deals, total] = await db.$transaction([
    db.deal.findMany({
      where,
      include: { job: { select: { title: true, category: true } } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    }),
    db.deal.count({ where }),
  ]);

  res.json({ deals, total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
});

// ─── GET /deals/:dealId — Get deal (DB + optional on-chain sync) ─────────────

router.get('/:dealId', async (req, res) => {
  const dealId = BigInt(req.params.dealId);
  const sync = req.query.sync === 'true';

  if (sync) {
    if (!config.DEALFORGE_CONTRACT_ADDRESS) {
      res.status(503).json({ error: 'Contract address not configured — cannot sync from chain' });
      return;
    }
    try {
      await syncDealToDb(dealId);
    } catch (err) {
      console.error('Chain sync failed:', err);
      // Fall through and return whatever is in DB
    }
  }

  const deal = await db.deal.findUnique({
    where: { dealId },
    include: { job: { select: { title: true, description: true, category: true, taskDescriptionCid: true } } },
  });

  if (!deal) { res.status(404).json({ error: 'Deal not found' }); return; }
  res.json(deal);
});

// ─── GET /deals/:dealId/chain — Read directly from chain ─────────────────────

router.get('/:dealId/chain', async (req, res) => {
  if (!config.DEALFORGE_CONTRACT_ADDRESS) {
    res.status(503).json({ error: 'Contract address not configured' });
    return;
  }

  const dealId = BigInt(req.params.dealId);
  const onChain = await getDealOnChain(dealId);

  // Serialize bigints for JSON
  res.json({
    id: onChain.id.toString(),
    payer: onChain.payer,
    worker: onChain.worker,
    token: onChain.token,
    amount: onChain.amount.toString(),
    deadline: onChain.deadline.toString(),
    task_hash: onChain.taskHash,
    result_hash: onChain.resultHash,
    status: onChain.status,
    created_at: onChain.createdAt.toString(),
    submitted_at: onChain.submittedAt.toString(),
  });
});

// ─── POST /deals — Mirror on-chain deal into DB ───────────────────────────────
//
// Called by the payer after `createDeal()` succeeds on-chain.
// Fetches authoritative data from chain; only `tx_hash` (and optional `job_id`)
// are accepted from the request body.

router.post('/', requireAuth, async (req, res) => {
  const parsed = mirrorDealSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  if (!config.DEALFORGE_CONTRACT_ADDRESS) {
    res.status(503).json({ error: 'Contract address not configured' });
    return;
  }

  const { deal_id, tx_hash, job_id, task_cid } = parsed.data;
  const dealId = BigInt(deal_id);

  // Verify deal exists on-chain (throws if not found / RPC error)
  let onChain;
  try {
    onChain = await getDealOnChain(dealId);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch deal from chain', detail: String(err) });
    return;
  }

  // Caller must be the payer
  if (onChain.payer !== req.agentAddress) {
    res.status(403).json({ error: 'Only the payer can mirror a deal' });
    return;
  }

  // If a job_id is provided, lock the linked job and get its taskCid
  let resolvedTaskCid: string | null = task_cid ?? null;
  if (job_id) {
    const job = await db.job.findUnique({ where: { id: job_id } });
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    if (job.posterAddress !== req.agentAddress) {
      res.status(403).json({ error: 'Job does not belong to the caller' });
      return;
    }
    resolvedTaskCid = job.taskDescriptionCid ?? resolvedTaskCid;
  }

  const settledAt = onChain.status === DealStatus.SETTLED ? new Date() : undefined;

  const deal = await db.deal.upsert({
    where: { dealId },
    create: {
      dealId,
      jobId: job_id ?? null,
      payer: onChain.payer,
      worker: onChain.worker,
      amount: onChain.amount.toString(),
      status: onChain.status,
      txHash: tx_hash,
      ...(resolvedTaskCid ? { taskCid: resolvedTaskCid } : {}),
      ...(settledAt ? { settledAt } : {}),
    },
    update: {
      ...(job_id ? { jobId: job_id } : {}),
      status: onChain.status,
      txHash: tx_hash,
      ...(resolvedTaskCid ? { taskCid: resolvedTaskCid } : {}),
      ...(settledAt ? { settledAt } : {}),
    },
  });

  // Lock the associated job if deal is active/created
  if (job_id && (onChain.status === DealStatus.CREATED || onChain.status === DealStatus.ACTIVE)) {
    await db.job.updateMany({
      where: { id: job_id, status: { in: [JobStatus.open, JobStatus.negotiating] } },
      data: { status: JobStatus.locked },
    });
  }

  res.status(201).json(deal);
});

// ─── PATCH /deals/:dealId — Update taskCid (payer only) ──────────────────────

router.patch('/:dealId', requireAuth, async (req, res) => {
  const dealId = BigInt(req.params.dealId);
  const deal = await db.deal.findUnique({ where: { dealId } });
  if (!deal) { res.status(404).json({ error: 'Deal not found' }); return; }
  if (deal.payer !== req.agentAddress) {
    res.status(403).json({ error: 'Only the payer can update deal metadata' });
    return;
  }

  const { task_cid } = req.body as { task_cid?: string };
  if (!task_cid) { res.status(400).json({ error: 'Nothing to update' }); return; }

  const updated = await db.deal.update({ where: { dealId }, data: { taskCid: task_cid } as never });
  res.json(updated);
});

router.post('/:dealId/delegation', requireAuth, async (req, res) => {
  const parsed = delegationSchema.safeParse(req.body.delegation);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const dealId = BigInt(req.params.dealId);
  const deal = await db.deal.findUnique({
    where: { dealId },
    select: { jobId: true, payer: true },
  });

  if (!deal) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }

  if (deal.payer !== req.agentAddress) {
    res.status(403).json({ error: 'Only the payer can attach delegation to this deal' });
    return;
  }

  if (!deal.jobId) {
    res.status(409).json({ error: 'Deal is not linked to a job' });
    return;
  }

  await db.job.update({
    where: { id: deal.jobId },
    data: { delegationJson: parsed.data } as never,
  });

  res.status(201).json({
    deal_id: dealId.toString(),
    job_id: deal.jobId,
    delegation: parsed.data,
  });
});

// ─── POST /deals/:dealId/submit-result — Worker uploads result to IPFS ───────

router.post('/:dealId/submit-result', requireAuth, async (req, res) => {
  const dealId = BigInt(req.params.dealId);

  const deal = await db.deal.findUnique({ where: { dealId } });
  if (!deal) { res.status(404).json({ error: 'Deal not found — POST /deals first' }); return; }
  if (deal.worker !== req.agentAddress) {
    res.status(403).json({ error: 'Only the worker can submit a result' });
    return;
  }
  if (deal.status !== DealStatus.ACTIVE) {
    res.status(409).json({ error: `Deal is ${deal.status}, expected ACTIVE` });
    return;
  }

  const { result } = req.body;
  if (result === undefined) {
    res.status(400).json({ error: 'Missing required field: result' });
    return;
  }

  try {
    const upload = await uploadRawResult(dealId, result);

    await db.deal.update({ where: { dealId }, data: { resultCid: upload.cid } as never });

    res.json({ cid: upload.cid, url: upload.url, size: upload.size });
  } catch (err) {
    res.status(502).json({ error: 'Failed to upload result to IPFS', detail: String(err) });
  }
});

// ─── POST /deals/:dealId/sync — Re-sync deal state from chain ────────────────

router.post('/:dealId/sync', requireAuth, async (req, res) => {
  if (!config.DEALFORGE_CONTRACT_ADDRESS) {
    res.status(503).json({ error: 'Contract address not configured' });
    return;
  }

  const dealId = BigInt(req.params.dealId);

  const existing = await db.deal.findUnique({ where: { dealId } });
  if (!existing) { res.status(404).json({ error: 'Deal not in DB — POST /deals first' }); return; }

  // Only payer or worker may trigger a sync
  if (existing.payer !== req.agentAddress && existing.worker !== req.agentAddress) {
    res.status(403).json({ error: 'Only the payer or worker can sync this deal' });
    return;
  }

  try {
    await syncDealToDb(dealId, { jobId: existing.jobId ?? undefined });
  } catch (err) {
    res.status(502).json({ error: 'Failed to sync from chain', detail: String(err) });
    return;
  }

  const updated = await db.deal.findUnique({ where: { dealId } });
  res.json(updated);
});

export default router;

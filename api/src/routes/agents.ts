import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ─── Validation ─────────────────────────────────────────────────────────────

const registerSchema = z.object({
  capabilities: z.array(z.string().min(1)).min(1),
  pricing_policy: z.object({
    min_price_wei: z.string().regex(/^\d+$/),
    max_price_wei: z.string().regex(/^\d+$/),
    preferred_deadline_hours: z.number().int().positive(),
  }),
  description: z.string().min(1).max(1000),
  ens_name: z.string().optional(),
});

// ─── GET /agents/:address — Get agent profile ────────────────────────────────

router.get('/:address', async (req, res) => {
  const agent = await db.agent.findUnique({
    where: { address: req.params.address.toLowerCase() },
    select: {
      address: true,
      capabilities: true,
      reputationScore: true,
      ensName: true,
      description: true,
      lastSeen: true,
      createdAt: true,
      _count: { select: { postedJobs: true, proposals: true } },
    },
  });

  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  res.json(agent);
});

// ─── GET /agents — List agents (with optional capability filter) ─────────────

router.get('/', async (req, res) => {
  const { capability, limit = '20', offset = '0' } = req.query as Record<string, string>;

  const agents = await db.agent.findMany({
    where: capability ? { capabilities: { has: capability } } : undefined,
    select: {
      address: true,
      capabilities: true,
      reputationScore: true,
      ensName: true,
      description: true,
      lastSeen: true,
    },
    orderBy: { reputationScore: 'desc' },
    take: parseInt(limit, 10),
    skip: parseInt(offset, 10),
  });

  res.json({ agents });
});

// ─── POST /agents — Register or update an agent ──────────────────────────────

router.post('/', requireAuth, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { capabilities, pricing_policy, description, ens_name } = parsed.data;

  const agent = await db.agent.upsert({
    where: { address: req.agentAddress! },
    create: {
      address: req.agentAddress!,
      capabilities,
      pricingPolicy: pricing_policy,
      description,
      ensName: ens_name ?? null,
    },
    update: {
      capabilities,
      pricingPolicy: pricing_policy,
      description,
      ensName: ens_name ?? null,
      lastSeen: new Date(),
    },
  });

  res.status(201).json(agent);
});

// ─── PATCH /agents/me/heartbeat — Update last_seen ──────────────────────────

router.patch('/me/heartbeat', requireAuth, async (req, res) => {
  await db.agent.update({
    where: { address: req.agentAddress! },
    data: { lastSeen: new Date() },
  });
  res.json({ ok: true });
});

// ─── GET /agents/:address/deals — Deal history for reputation ────────────────

router.get('/:address/deals', async (req, res) => {
  const addr = req.params.address.toLowerCase();

  const [asPayer, asWorker] = await Promise.all([
    db.deal.findMany({
      where: { payer: addr },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.deal.findMany({
      where: { worker: addr },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const settled = [...asPayer, ...asWorker].filter((d) => d.status === 'SETTLED');
  const disputed = [...asPayer, ...asWorker].filter((d) => d.status === 'DISPUTED');

  res.json({
    address: addr,
    total_as_payer: asPayer.length,
    total_as_worker: asWorker.length,
    settled_count: settled.length,
    disputed_count: disputed.length,
    deals_as_payer: asPayer,
    deals_as_worker: asWorker,
  });
});

export default router;

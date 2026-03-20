import { Router } from 'express';
import { z } from 'zod';
import { JobStatus, ProposalStatus } from '../../generated/prisma/client';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireEvaluationPayment, requireMatchesPayment } from '../middleware/payment';
import { evaluateProposal } from '../services/negotiation-engine';
import { uploadTaskDescription } from '../services/ipfs';
import { findMatches } from '../services/matchmaker';
import { syncAcceptedProposalDelegation } from '../services/delegation-sync';

const router = Router();

// ─── Validation schemas ─────────────────────────────────────────────────────


const postJobSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(10),
  max_budget: z.string().regex(/^\d+$/, 'must be wei as decimal string'),
  deadline: z.number().int().positive(),
  category: z.string().min(1).max(64),
});

const proposalSchema = z.object({
  proposed_price: z.string().regex(/^\d+$/, 'must be wei as decimal string'),
  proposed_deadline: z.number().int().positive(),
  message: z.string().min(1).max(2000),
});

// NEW — frontend sends signed delegation when posting a job
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

// ─── GET /jobs  ───────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const {
    category,
    status,
    limit = '20',
    offset = '0',
  } = req.query as Record<string, string>;

  const where = {
    ...(status ? { status: status as JobStatus } : {}),
    ...(category ? { category } : {}),
  };

  const [jobs, total] = await db.$transaction([
    db.job.findMany({
      where,
      include: { poster: { select: { ensName: true, reputationScore: true } } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    }),
    db.job.count({ where }),
  ]);

  res.json({ jobs, total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
});

// ─── GET /jobs/:id — ───────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const job = await db.job.findUnique({
    where: { id: req.params.id },
    include: {
      poster: { select: { ensName: true, reputationScore: true } },
      _count: { select: { proposals: true } },
    },
  });

  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json({ ...job, proposal_count: job._count.proposals });
});

// ─── POST /jobs —  now also accepts + stores signed delegation ────────

router.post('/', requireAuth, async (req, res) => {
  const parsed = postJobSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // NEW — delegation is optional here (user signs it on frontend)
  // If provided, we store it alongside the job
  const delegationParsed = delegationSchema.safeParse(req.body.delegation);
  const signedDelegation = delegationParsed.success ? delegationParsed.data : null;

  const agentExists = await db.agent.findUnique({ where: { address: req.agentAddress! } });
  if (!agentExists) {
    res.status(403).json({ error: 'Agent not registered. POST /agents first.' });
    return;
  }

  const { title, description, max_budget, deadline, category } = parsed.data;

  const job = await db.job.create({
    data: {
      posterAddress: req.agentAddress!,
      title,
      description,
      maxBudget: max_budget,
      deadline: BigInt(deadline),
      category,
      // NEW — store the raw signed delegation JSON from user's MetaMask
      // Add delegationJson Json? to your Prisma schema on the Job model
      ...(signedDelegation ? { delegationJson: signedDelegation } : {}),
    },
  });

  try {
    const taskUpload = await uploadTaskDescription(job.id, {
      task: description,
      format: 'text/plain',
      constraints: [],
      metadata: {
        title,
        category,
        poster_address: req.agentAddress!,
      },
    });

    const updatedJob = await db.job.update({
      where: { id: job.id },
      data: { taskDescriptionCid: taskUpload.cid },
    });

    res.status(201).json(updatedJob);
  } catch (err) {
    await db.job.delete({ where: { id: job.id } }).catch(() => undefined);
    res.status(502).json({ error: 'Failed to upload task description to IPFS', detail: String(err) });
  }
});

// ─── GET /jobs/:id/matches  ──────────────────────────────────────

router.get('/:id/matches', requireMatchesPayment, async (req, res) => {
  const job = await db.job.findUnique({ where: { id: req.params.id } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const matches = await findMatches(job);
  res.json({ matches });
});

// ─── GET /jobs/:id/proposals  ────────────────────────────────────

router.get('/:id/proposals', async (req, res) => {
  const proposals = await db.proposal.findMany({
    where: { jobId: req.params.id },
    include: { worker: { select: { ensName: true, reputationScore: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ proposals });
});

// ─── POST /jobs/:id/proposals  ───────────────────────────────────

router.post('/:id/proposals', requireAuth, async (req, res) => {
  const parsed = proposalSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const job = await db.job.findUnique({ where: { id: req.params.id } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (job.status !== JobStatus.open && job.status !== JobStatus.negotiating) {
    res.status(409).json({ error: `Job is ${job.status} and not accepting proposals` });
    return;
  }
  if (job.posterAddress === req.agentAddress) {
    res.status(400).json({ error: 'Cannot propose on your own job' });
    return;
  }

  const { proposed_price, proposed_deadline, message } = parsed.data;

  const [proposal] = await db.$transaction([
    db.proposal.create({
      data: {
        jobId: req.params.id,
        workerAddress: req.agentAddress!,
        proposedPrice: proposed_price,
        proposedDeadline: BigInt(proposed_deadline),
        message,
      },
    }),
    db.job.update({
      where: { id: req.params.id, status: JobStatus.open },
      data: { status: JobStatus.negotiating },
    }),
  ]);

  res.status(201).json(proposal);
});

// ─── POST /jobs/:id/proposals/:pid/evaluate  ───────────────────────
// Only change: when decision is "accept", also create sub-delegation

router.post('/:id/proposals/:pid/evaluate', requireAuth, requireEvaluationPayment, async (req, res) => {
  const [job, proposal] = await Promise.all([
    db.job.findUnique({ where: { id: req.params.id } }),
    db.proposal.findUnique({ where: { id: req.params.pid } }),
  ]);

  if (!job || !proposal) { res.status(404).json({ error: 'Job or proposal not found' }); return; }
  if (job.posterAddress !== req.agentAddress) {
    res.status(403).json({ error: 'Only the job poster can evaluate proposals' });
    return;
  }

  const agent = await db.agent.findUnique({ where: { address: req.agentAddress! } });
  const policy = (agent?.pricingPolicy ?? {
    min_price_wei: '0',
    max_price_wei: job.maxBudget,
    preferred_deadline_hours: 24,
  }) as unknown as Parameters<typeof evaluateProposal>[2];

  const evaluation = await evaluateProposal(job, proposal, policy);

  // Persist decision
  await db.$transaction(async (tx) => {
    if (evaluation.decision === 'accept') {
      await tx.proposal.update({ where: { id: proposal.id }, data: { status: ProposalStatus.accepted } });
      await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.locked } });
    } else if (evaluation.decision === 'reject') {
      await tx.proposal.update({ where: { id: proposal.id }, data: { status: ProposalStatus.rejected } });
    } else if (evaluation.decision === 'counter') {
      await tx.proposal.update({ where: { id: proposal.id }, data: { status: ProposalStatus.countered } });
    }
  });

  // NEW — when accepted, create sub-delegation from parent delegation
  // This is the core novel pattern: negotiation outcome → on-chain permission
  let subDelegation = null;
  if (evaluation.decision === 'accept') {
    try {
      const linkedDeal = await db.deal.findUnique({
        where: { jobId: job.id },
        select: { dealId: true },
      });

      if (linkedDeal) {
        const synced = await syncAcceptedProposalDelegation(job.id, linkedDeal.dealId.toString());
        subDelegation = synced?.subDelegation ?? null;
      }
    } catch (err) {
      // Non-fatal — log but don't fail the evaluation response
      // Worker can still be paid via manual settleDeal fallback
      console.error('[evaluate] Sub-delegation creation failed:', err);
    }
  }

  res.json({
    ...evaluation,
    // Return sub-delegation to worker agent so it knows it can redeem
    sub_delegation: subDelegation,
  });
});

// ─── NEW: GET /jobs/:id/delegation — worker fetches parent delegation ────────
// Worker agent calls this to get the delegation before redeeming

router.get('/:id/delegation', requireAuth, async (req, res) => {
  const job = await db.job.findUnique({ where: { id: req.params.id } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const delegation = (job as any).delegationJson;
  if (!delegation) {
    res.status(404).json({ error: 'No delegation found for this job' });
    return;
  }

  res.json({ delegation });
});

router.get('/:id/proposals/:pid/subdelegation', requireAuth, async (req, res) => {
  const proposal = await db.proposal.findUnique({
    where: { id: req.params.pid },
  }) as ({ id: string; jobId: string; workerAddress: string; subDelegationJson?: unknown } | null);

  if (!proposal || proposal.jobId !== req.params.id) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }

  if (proposal.workerAddress !== req.agentAddress) {
    res.status(403).json({ error: 'Only the selected worker can fetch this sub-delegation' });
    return;
  }

  if (!proposal.subDelegationJson) {
    res.status(404).json({ error: 'No sub-delegation found for this proposal' });
    return;
  }

  res.json({ subDelegation: proposal.subDelegationJson });
});

export default router;

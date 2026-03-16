/**
 * NegotiationEngine — Venice-powered off-chain proposal evaluator.
 *
 * Uses Venice via the OpenAI-compatible endpoint so we keep
 * the standard openai SDK with zero extra dependencies.
 *
 * Runs fully off-chain; only the final agreed terms are committed
 * to the DealForge smart contract.
 */

import OpenAI from 'openai';
import type { Job, Proposal } from '../../generated/prisma/client';
import { config } from '../config';
import type { PricingPolicy, NegotiationEvaluation } from '../types';

const client = new OpenAI({
  apiKey: config.VENICE_INFERENCE_KEY,
  baseURL: config.LLM_BASE_URL,
});

// ─── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the NegotiationEngine for a DealForge autonomous agent.
DealForge is a trustless on-chain escrow protocol where AI agents hire each other for tasks.

Your role: evaluate incoming proposals against a job specification and an agent's pricing policy.
You MUST respond with valid JSON ONLY — no markdown, no prose, matching this exact schema:

{
  "decision": "accept" | "reject" | "counter",
  "reasoning": "<1-3 sentence explanation>",
  "score": <integer 0-100>,
  "counter_offer": {
    "proposed_price": "<wei as decimal string>",
    "proposed_deadline": <unix timestamp integer>,
    "message": "<counter-offer message>"
  }
}

Only include counter_offer when decision is "counter".

Evaluation criteria (weight equally):
1. PRICE FIT — Is the proposed price within the agent's min/max policy?
2. DEADLINE FIT — Is the deadline achievable for the task?
3. CAPABILITY FIT — Does the worker's message show they can do the job?
4. MARKET FAIRNESS — Is the price reasonable for the work described?

Counter-offer rules:
- Counter price = midpoint between proposal price and policy mid-point
- Counter deadline = realistic estimate + 10% buffer
- Keep counter message professional and concise`;

// ─── Main evaluation function ───────────────────────────────────────────────

export async function evaluateProposal(
  job: Job,
  proposal: Proposal,
  agentPolicy: PricingPolicy,
): Promise<NegotiationEvaluation> {
  const response = await client.chat.completions.create({
    model: config.LLM_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildEvaluationPrompt(job, proposal, agentPolicy) },
    ],
  });

  return parseEvaluation(response.choices[0].message.content ?? '');
}

// ─── Batch ranking for matchmaking ─────────────────────────────────────────

export async function rankProposals(
  job: Job,
  proposals: Proposal[],
): Promise<Array<{ proposal: Proposal; score: number; reasoning: string }>> {
  if (proposals.length === 0) return [];

  const response = await client.chat.completions.create({
    model: config.LLM_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You rank agent proposals for a DealForge task. Respond ONLY with JSON: { "rankings": [{ "proposal_id": "<id>", "score": <0-100>, "reasoning": "<1 sentence>" }] } ordered best-to-worst.',
      },
      { role: 'user', content: buildRankingPrompt(job, proposals) },
    ],
  });

  const parsed = parseJsonSafe<{ rankings: Array<{ proposal_id: string; score: number; reasoning: string }> }>(
    response.choices[0].message.content ?? '',
  );

  return (parsed.rankings ?? [])
    .map((r) => ({
      proposal: proposals.find((p) => p.id === r.proposal_id)!,
      score: r.score,
      reasoning: r.reasoning,
    }))
    .filter((r) => r.proposal != null);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildEvaluationPrompt(job: Job, proposal: Proposal, policy: PricingPolicy): string {
  return `Evaluate this proposal:

JOB:
Title: ${job.title}
Description: ${job.description}
Max Budget (wei): ${job.maxBudget}
Deadline: ${new Date(Number(job.deadline) * 1000).toISOString()}
Category: ${job.category}

PROPOSAL:
Worker: ${proposal.workerAddress}
Proposed Price (wei): ${proposal.proposedPrice}
Proposed Deadline: ${new Date(Number(proposal.proposedDeadline) * 1000).toISOString()}
Worker Message: "${proposal.message}"

AGENT PRICING POLICY:
Min acceptable price (wei): ${policy.min_price_wei}
Max acceptable price (wei): ${policy.max_price_wei}
Preferred deadline (hours): ${policy.preferred_deadline_hours}`;
}

function buildRankingPrompt(job: Job, proposals: Proposal[]): string {
  return `Rank these ${proposals.length} proposals for the job below.

JOB:
Title: ${job.title}
Description: ${job.description}
Max Budget (wei): ${job.maxBudget}
Deadline: ${new Date(Number(job.deadline) * 1000).toISOString()}
Category: ${job.category}

PROPOSALS:
${proposals.map((p, i) => `[${i + 1}] ID: ${p.id}
  Worker: ${p.workerAddress}
  Price (wei): ${p.proposedPrice}
  Deadline: ${new Date(Number(p.proposedDeadline) * 1000).toISOString()}
  Message: ${p.message}`).join('\n\n')}`;
}

function parseEvaluation(raw: string): NegotiationEvaluation {
  try {
    const parsed = JSON.parse(raw);
    return {
      decision:      parsed.decision,
      reasoning:     parsed.reasoning ?? '',
      score:         Number(parsed.score ?? 0),
      counter_offer: parsed.counter_offer,
    };
  } catch {
    return {
      decision:  'reject',
      reasoning: 'Could not parse evaluation. Defaulting to reject for safety.',
      score:     0,
    };
  }
}

function parseJsonSafe<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

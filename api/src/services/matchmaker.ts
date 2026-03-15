/**
 * Matchmaker — scores and ranks worker agents for a given job.
 *
 * Scoring factors (each 0–25 pts):
 *   1. Capability overlap
 *   2. Price competitiveness  (lower ask = better for payer)
 *   3. Reputation score
 *   4. Recency (last_seen)
 */

import type { Job, Agent } from '../../generated/prisma/client';
import { db } from '../db/client';
import type { MatchScore } from '../types';

const MAX_MATCHES = 10;

export async function findMatches(job: Job): Promise<MatchScore[]> {
  const agents = await db.agent.findMany({
    where: {
      address: { not: job.posterAddress },
      lastSeen: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { reputationScore: 'desc' },
    take: 50,
  });

  return agents
    .map((agent) => scoreAgent(agent, job))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES);
}

function scoreAgent(agent: Agent, job: Job): MatchScore {
  const reasons: string[] = [];
  let score = 0;

  // ── 1. Capability overlap (0–25) ──────────────────────────────────────────
  const capScore = capabilityScore(agent.capabilities, job.category);
  score += capScore;
  if (capScore >= 25) reasons.push(`Exact capability match for "${job.category}"`);
  else if (capScore >= 15) reasons.push('Partial capability match');
  else reasons.push('General-purpose agent');

  // ── 2. Price competitiveness (0–25) ──────────────────────────────────────
  const policy = agent.pricingPolicy as { min_price_wei?: string } | null;
  const minPrice = policy?.min_price_wei ?? '0';
  const priceScore = priceCompetitivenessScore(minPrice, job.maxBudget);
  score += priceScore;
  if (priceScore >= 20) reasons.push('Price well within budget');
  else if (priceScore >= 10) reasons.push('Price marginally within budget');
  else reasons.push('May exceed budget');

  // ── 3. Reputation (0–25) ─────────────────────────────────────────────────
  const repScore = Math.min(25, Math.round((agent.reputationScore / 100) * 25));
  score += repScore;
  if (repScore >= 20) reasons.push(`High reputation (${agent.reputationScore.toFixed(0)}/100)`);
  else if (repScore >= 10) reasons.push(`Moderate reputation (${agent.reputationScore.toFixed(0)}/100)`);

  // ── 4. Recency (0–25) ────────────────────────────────────────────────────
  const recScore = recencyPoints(agent.lastSeen);
  score += recScore;
  if (recScore >= 20) reasons.push('Very recently active');
  else if (recScore >= 10) reasons.push('Active recently');

  return {
    agent: {
      address: agent.address,
      capabilities: agent.capabilities,
      pricing_policy: policy as MatchScore['agent']['pricing_policy'],
      reputation_score: agent.reputationScore,
      ens_name: agent.ensName,
      description: agent.description,
      last_seen: agent.lastSeen,
    },
    score,
    reasons,
  };
}

function capabilityScore(capabilities: string[], category: string): number {
  if (!capabilities.length) return 5;
  const norm = category.toLowerCase();
  if (capabilities.some((c) => c.toLowerCase() === norm)) return 25;
  if (capabilities.some((c) => c.toLowerCase().includes(norm) || norm.includes(c.toLowerCase()))) return 15;
  return 5;
}

function priceCompetitivenessScore(minPriceWei: string, maxBudgetWei: string): number {
  try {
    const min = BigInt(minPriceWei);
    const max = BigInt(maxBudgetWei);
    if (max === 0n || min > max) return 0;
    const ratio = Number((max - min) * 100n / max);
    return Math.min(25, Math.round(ratio / 4));
  } catch { return 0; }
}

function recencyPoints(lastSeen: Date): number {
  const ageMin = (Date.now() - lastSeen.getTime()) / 60_000;
  if (ageMin < 5) return 25;
  if (ageMin < 30) return 20;
  if (ageMin < 60) return 15;
  if (ageMin < 360) return 10;
  return 5;
}

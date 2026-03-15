// ─── Deal lifecycle ────────────────────────────────────────────────────────────

export type DealStatus =
  | 'CREATED'
  | 'ACTIVE'
  | 'SUBMITTED'
  | 'SETTLED'
  | 'REFUNDED'
  | 'DISPUTED';

export type JobStatus = 'open' | 'negotiating' | 'locked' | 'completed' | 'cancelled';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'countered';

// ─── Database entities ─────────────────────────────────────────────────────────

export interface Job {
  id: string;
  poster_address: string;
  title: string;
  description: string;
  task_description_cid: string | null;
  max_budget: string;        // wei as string
  deadline: number;          // unix timestamp
  category: string;
  status: JobStatus;
  created_at: Date;
  updated_at: Date;
}

export interface Proposal {
  id: string;
  job_id: string;
  worker_address: string;
  proposed_price: string;    // wei as string
  proposed_deadline: number; // unix timestamp
  message: string;
  status: ProposalStatus;
  created_at: Date;
  updated_at: Date;
}

export interface Agent {
  address: string;
  capabilities: string[];
  pricing_policy: PricingPolicy;
  reputation_score: number;
  ens_name: string | null;
  description: string;
  last_seen: Date;
}

export interface PricingPolicy {
  min_price_wei: string;
  max_price_wei: string;
  preferred_deadline_hours: number;
}

export interface Message {
  id: string;
  job_id: string;
  sender: string;
  receiver: string;
  content: string;           // encrypted payload
  signature: string;
  timestamp: Date;
}

export interface OnchainDeal {
  deal_id: number;
  job_id: string | null;
  payer: string;
  worker: string;
  amount: string;
  status: DealStatus;
  tx_hash: string;
  settled_at: Date | null;
}

// ─── API request/response shapes ───────────────────────────────────────────────

export interface PostJobRequest {
  title: string;
  description: string;
  max_budget: string;
  deadline: number;
  category: string;
  task_description_cid?: string;
}

export interface PostProposalRequest {
  proposed_price: string;
  proposed_deadline: number;
  message: string;
}

export interface RegisterAgentRequest {
  capabilities: string[];
  pricing_policy: PricingPolicy;
  description: string;
  ens_name?: string;
}

// ─── Negotiation engine types ──────────────────────────────────────────────────

export type NegotiationDecision = 'accept' | 'reject' | 'counter';

export interface NegotiationEvaluation {
  decision: NegotiationDecision;
  reasoning: string;
  score: number;             // 0–100 fit score
  counter_offer?: {
    proposed_price: string;
    proposed_deadline: number;
    message: string;
  };
}

export interface MatchScore {
  agent: Agent;
  score: number;
  reasons: string[];
}

// ─── WebSocket protocol ────────────────────────────────────────────────────────

export type WsMessageType =
  | 'join'
  | 'proposal'
  | 'counter'
  | 'accept'
  | 'reject'
  | 'chat'
  | 'error'
  | 'system';

export interface WsEnvelope {
  type: WsMessageType;
  job_id: string;
  sender: string;
  payload: unknown;
  signature: string;  // EIP-191 sig over JSON.stringify({type, job_id, sender, payload})
  timestamp: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthChallenge {
  address: string;
  nonce: string;
  issued_at: string;
}

export interface AuthRequest {
  address: string;
  signature: string; // EIP-712 sig over AuthChallenge
}

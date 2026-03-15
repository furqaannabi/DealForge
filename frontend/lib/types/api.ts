export type ApiJobStatus = 'open' | 'negotiating' | 'locked' | 'completed' | 'cancelled';
export type ApiDealStatus = 'CREATED' | 'ACTIVE' | 'SUBMITTED' | 'SETTLED' | 'REFUNDED' | 'DISPUTED';

export interface ApiJob {
  id: string;
  title: string;
  description: string;
  maxBudget?: string;
  max_budget?: string;
  deadline: string | number;
  category: string;
  status: ApiJobStatus;
  createdAt?: string;
  created_at?: string;
}

export interface ApiAgent {
  address: string;
  capabilities: string[];
  reputationScore?: number;
  reputation_score?: number;
  ensName?: string | null;
  ens_name?: string | null;
  description: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

export interface ApiDeal {
  dealId?: number;
  deal_id?: number;
  payer: string;
  worker: string;
  amount: string;
  status: ApiDealStatus;
  txHash?: string;
  tx_hash?: string;
}

export interface JobsListResponse {
  jobs: ApiJob[];
  total: number;
}

export interface AgentsListResponse {
  agents: ApiAgent[];
}

export interface AgentDealsResponse {
  address: string;
  settled_count: number;
  disputed_count: number;
  deals_as_payer: ApiDeal[];
  deals_as_worker: ApiDeal[];
}

export interface CreateJobRequest {
  title: string;
  description: string;
  max_budget: string;
  deadline: number;
  category: string;
}

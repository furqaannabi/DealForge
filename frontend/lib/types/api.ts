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

export interface AuthChallengeResponse {
  address: string;
  nonce: string;
  issued_at: string;
}

export interface AuthVerifyRequest {
  address: string;
  nonce: string;
  issued_at: string;
  signature: string;
}

export interface AuthVerifyResponse {
  verified: boolean;
  address: string;
}

export interface ApiDeal {
  dealId?: number | string;
  deal_id?: number | string;
  jobId?: string | null;
  job_id?: string | null;
  taskCid?: string | null;
  task_cid?: string | null;
  resultCid?: string | null;
  result_cid?: string | null;
  payer: string;
  worker: string;
  amount: string;
  status: ApiDealStatus;
  txHash?: string;
  tx_hash?: string;
  settledAt?: string | null;
  settled_at?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  job?: {
    title?: string;
    category?: string;
  } | null;
}

export interface ApiDelegationCaveat {
  enforcer: string;
  terms: string;
  args?: string;
}

export interface ApiDelegation {
  delegate: string;
  delegator: string;
  authority: string;
  caveats: ApiDelegationCaveat[];
  salt: string;
  signature: string;
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

export interface DealsListResponse {
  deals: ApiDeal[];
  total: number;
  limit: number;
  offset: number;
}

export interface AttachDealDelegationResponse {
  deal_id: string;
  job_id: string;
  delegation: ApiDelegation;
  sub_delegation: ApiDelegation | null;
}

export interface CreateJobRequest {
  title: string;
  description: string;
  max_budget: string;
  deadline: number;
  category: string;
  delegation?: ApiDelegation;
}

export interface AgentRegistrationRequest {
  capabilities: string[];
  pricing_policy: {
    min_price_wei: string;
    max_price_wei: string;
    preferred_deadline_hours: number;
  };
  description: string;
  ens_name: string;
}

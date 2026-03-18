import { DEMO_AGENT_ADDRESS } from '@/lib/config';
import type {
  AgentDealsResponse,
  AgentRegistrationRequest,
  AgentsListResponse,
} from '@/lib/types/api';
import { apiRequest } from './http';

export async function listAgents() {
  return apiRequest<AgentsListResponse>('/agents');
}

export async function registerAgent(address: string, payload: AgentRegistrationRequest) {
  return apiRequest('/agents', {
    method: 'POST',
    headers: {
      'x-agent-address': address,
    },
    body: JSON.stringify(payload),
  });
}

export async function ensureDemoAgentRegistered(address = DEMO_AGENT_ADDRESS) {
  return registerAgent(address, {
    capabilities: ['data-analysis', 'python', 'web-scraping'],
    pricing_policy: {
      min_price_wei: '10000000000000000',
      max_price_wei: '1000000000000000000',
      preferred_deadline_hours: 24,
    },
    description: 'Frontend demo task agent wired to the DealForge coordination API.',
    ens_name: 'myagent.eth',
  });
}

export async function getAgentDeals(address = DEMO_AGENT_ADDRESS) {
  return apiRequest<AgentDealsResponse>(`/agents/${address}/deals`);
}

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

export async function getAgentDeals(address: string) {
  return apiRequest<AgentDealsResponse>(`/agents/${address}/deals`);
}

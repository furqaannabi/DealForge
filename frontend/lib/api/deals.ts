import type {
  AttachDealDelegationResponse,
  DealsListResponse,
  ApiDelegation,
} from '@/lib/types/api';
import { apiRequest } from './http';

interface ListDealsParams {
  status?: string;
  payer?: string;
  worker?: string;
  limit?: number;
  offset?: number;
}

export async function listDeals(params: ListDealsParams = {}) {
  const query = new URLSearchParams();

  if (params.status) query.set('status', params.status);
  if (params.payer) query.set('payer', params.payer);
  if (params.worker) query.set('worker', params.worker);
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));
  if (typeof params.offset === 'number') query.set('offset', String(params.offset));

  const suffix = query.toString();
  const path = suffix ? `/deals?${suffix}` : '/deals';

  return apiRequest<DealsListResponse>(path);
}

export async function attachDealDelegation(
  dealId: number | string,
  delegation: ApiDelegation,
  agentAddress: string,
) {
  return apiRequest<AttachDealDelegationResponse>(`/deals/${dealId}/delegation`, {
    method: 'POST',
    headers: {
      'x-agent-address': agentAddress,
    },
    body: JSON.stringify({ delegation }),
  });
}

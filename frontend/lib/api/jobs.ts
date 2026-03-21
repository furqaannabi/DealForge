import type {
  ApiJob,
  CreateJobRequest,
  JobsListResponse,
  ProposalEvaluationResponse,
  ProposalsListResponse,
} from '@/lib/types/api';
import { DEMO_AGENT_ADDRESS } from '@/lib/config';
import { apiRequest } from './http';

interface ListJobsParams {
  status?: string;
  limit?: number;
  offset?: number;
}

// Omitting status returns all jobs. Pass "open" when a screen only wants the public task board.
export async function listJobs(params: ListJobsParams = {}) {
  const query = new URLSearchParams();

  if (params.status) query.set('status', params.status);
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));
  if (typeof params.offset === 'number') query.set('offset', String(params.offset));

  const suffix = query.toString();
  return apiRequest<JobsListResponse>(suffix ? `/jobs?${suffix}` : '/jobs');
}

export async function createJob(payload: CreateJobRequest, agentAddress = DEMO_AGENT_ADDRESS) {
  return apiRequest<ApiJob>('/jobs', {
    method: 'POST',
    headers: {
      'x-agent-address': agentAddress,
    },
    body: JSON.stringify(payload),
  });
}

export async function listJobProposals(jobId: string) {
  return apiRequest<ProposalsListResponse>(`/jobs/${jobId}/proposals`);
}

export async function evaluateProposal(
  jobId: string,
  proposalId: string,
  agentAddress = DEMO_AGENT_ADDRESS,
) {
  return apiRequest<ProposalEvaluationResponse>(`/jobs/${jobId}/proposals/${proposalId}/evaluate`, {
    method: 'POST',
    headers: {
      'x-agent-address': agentAddress,
    },
    body: JSON.stringify({}),
  });
}

import type {
  ApiJob,
  CreateJobRequest,
  JobsListResponse,
  ProposalEvaluationResponse,
  ProposalsListResponse,
} from '@/lib/types/api';
import { DEMO_AGENT_ADDRESS } from '@/lib/config';
import { apiRequest } from './http';

// Omitting status returns all jobs. Pass "open" when a screen only wants the public task board.
export async function listJobs(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<JobsListResponse>(`/jobs${query}`);
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

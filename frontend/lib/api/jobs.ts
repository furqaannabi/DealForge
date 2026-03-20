import type { ApiJob, CreateJobRequest, JobsListResponse } from '@/lib/types/api';
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

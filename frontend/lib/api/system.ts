import type { HealthResponse } from '@/lib/types/api';
import { apiRequest } from './http';

export async function getHealth() {
  return apiRequest<HealthResponse>('/health');
}

import type {
  AuthChallengeResponse,
  AuthVerifyRequest,
  AuthVerifyResponse,
} from '@/lib/types/api';
import { apiRequest } from './http';

export async function getAuthChallenge(address: string) {
  const query = `?address=${encodeURIComponent(address)}`;
  return apiRequest<AuthChallengeResponse>(`/auth/challenge${query}`);
}

export async function verifyAuthChallenge(payload: AuthVerifyRequest) {
  return apiRequest<AuthVerifyResponse>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

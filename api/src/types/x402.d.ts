declare module '@coinbase/x402' {
  export interface FacilitatorConfig {
    url: string;
    createAuthHeaders?: () => Promise<{
      verify: Record<string, string>;
      settle: Record<string, string>;
      supported: Record<string, string>;
      list?: Record<string, string>;
    }>;
  }

  export function createFacilitatorConfig(
    apiKeyId?: string,
    apiKeySecret?: string,
  ): FacilitatorConfig;
}

declare module 'x402-express' {
  import type { RequestHandler } from 'express';

  export type Network = 'base' | 'base-sepolia';

  export interface PaymentRouteConfig {
    price: string;
    network: Network;
    config?: {
      description?: string;
      mimeType?: string;
      maxTimeoutSeconds?: number;
      resource?: string;
    };
  }

  export function paymentMiddleware(
    payTo: `0x${string}`,
    routes: Record<string, PaymentRouteConfig>,
    facilitator?: unknown,
    paywall?: unknown,
  ): RequestHandler;
}

import type { RequestHandler } from 'express';
import { createFacilitatorConfig } from '@coinbase/x402';
import { paymentMiddleware } from 'x402-express';
import { config } from '../config';

const noop: RequestHandler = (_req, _res, next) => next();

function createX402RouteMiddleware(routeConfig: Record<string, { price: string; network: 'base' | 'base-sepolia'; config: { description: string; mimeType: string } }>): RequestHandler {
  if (!config.X402_ENABLED || !config.X402_PAY_TO_ADDRESS) {
    return noop;
  }

  return paymentMiddleware(
    config.X402_PAY_TO_ADDRESS as `0x${string}`,
    routeConfig,
    createFacilitatorConfig(config.CDP_API_KEY_ID, config.CDP_API_KEY_SECRET),
  );
}

export const requireMatchesPayment = createX402RouteMiddleware({
  'GET /[id]/matches': {
    price: config.X402_MATCHES_PRICE,
    network: config.X402_NETWORK,
    config: {
      description: 'Access DealForge matchmaker rankings for a job',
      mimeType: 'application/json',
    },
  },
});

export const requireEvaluationPayment = createX402RouteMiddleware({
  'POST /[id]/proposals/[pid]/evaluate': {
    price: config.X402_EVALUATE_PRICE,
    network: config.X402_NETWORK,
    config: {
      description: 'Run the DealForge negotiation engine for a proposal',
      mimeType: 'application/json',
    },
  },
});

import { z } from 'zod';
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit';
import {
  DEALFORGE_ADDRESS_BASE_SEPOLIA,
  DEALFORGE_ADDRESS_BASE_MAINNET,
} from '../../shared/abis/DealForge';

const DEFAULT_LLM_PROVIDER = 'venice' as const;
const DEFAULT_LLMS = {
  venice: {
    baseURL: 'https://api.venice.ai/api/v1',
    model: 'zai-org-glm-4.7',
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash-preview-05-20',
  },
} as const;
const booleanish = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // x402 / AgentCash paid endpoints
  X402_ENABLED: booleanish.default('false'),
  X402_PAY_TO_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  X402_NETWORK: z.enum(['base', 'base-sepolia']).default('base-sepolia'),
  X402_MATCHES_PRICE: z.string().min(1).default('$0.01'),
  X402_EVALUATE_PRICE: z.string().min(1).default('$0.05'),
  CDP_API_KEY_ID: z.string().min(1).optional(),
  CDP_API_KEY_SECRET: z.string().min(1).optional(),

  // LLM inference
  LLM_PROVIDER: z.enum(['venice', 'gemini']).default(DEFAULT_LLM_PROVIDER),
  VENICE_INFERENCE_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().min(1).optional(),

  // Blockchain
  BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),
  BASE_SEPOLIA_RPC_URL: z.string().url().default('https://sepolia.base.org'),
  DEALFORGE_CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .default(
      process.env.NODE_ENV === 'production'
        ? DEALFORGE_ADDRESS_BASE_MAINNET
        : DEALFORGE_ADDRESS_BASE_SEPOLIA,
    )
    .optional(),

  // Auth
  JWT_SECRET: z.string().min(32).default('change-me-in-production-32-chars-min'),

  // IPFS — Pinata
  PINATA_JWT: z.string().min(1),
  PINATA_GATEWAY: z.string().min(1),

  // Agent wallet for signing sub-delegations
  AGENT_PRIVATE_KEY: z.string().min(1).optional(),
  VERIFIER_CAVEAT_ADDRESS: z.string().min(1).optional(),
  IPFS_CAVEAT_ADDRESS: z.string().min(1).optional(),

  WORKER_PRIVATE_KEY: z.string().min(1).optional(),
  API_BASE_URL: z.string().min(1).optional(),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  const env = result.data;
  const providerDefaults = DEFAULT_LLMS[env.LLM_PROVIDER];
  const apiKey = env.LLM_PROVIDER === 'venice' ? env.VENICE_INFERENCE_KEY : env.GEMINI_API_KEY;
  const smartAccountChainId = env.NODE_ENV === 'production' ? 8453 : 84532;
  const smartAccountsEnvironment = getSmartAccountsEnvironment(smartAccountChainId);

  if (env.X402_ENABLED) {
    if (!env.X402_PAY_TO_ADDRESS) {
      console.error('❌ X402_PAY_TO_ADDRESS is required when X402_ENABLED=true');
      process.exit(1);
    }
    if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) {
      console.error('❌ CDP_API_KEY_ID and CDP_API_KEY_SECRET are required when X402_ENABLED=true');
      process.exit(1);
    }
  }

  if (!apiKey) {
    console.error(`❌ Missing API key for LLM provider "${env.LLM_PROVIDER}"`);
    process.exit(1);
  }

  return {
    ...env,
    DELEGATION_MANAGER_ADDRESS: smartAccountsEnvironment.DelegationManager,
    LLM_API_KEY: apiKey,
    LLM_BASE_URL: env.LLM_BASE_URL ?? providerDefaults.baseURL,
    LLM_MODEL: env.LLM_MODEL ?? providerDefaults.model,
  };
}

export const config = loadConfig();
export type Config = typeof config;

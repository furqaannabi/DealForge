import 'dotenv/config';
import { z } from 'zod';

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

const envSchema = z.object({
  // Blockchain
  RPC_URL: z.string().url().default('https://sepolia.base.org'),
  WS_RPC_URL: z.string().optional(), // WebSocket RPC (preferred for event listening)
  CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a valid address'),
  PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 32-byte hex private key'),

  // IPFS
  IPFS_GATEWAY: z.string().url().default('https://gateway.pinata.cloud'),

  // LLM (OpenAI-compatible)
  LLM_PROVIDER: z.enum(['venice', 'gemini']).default(DEFAULT_LLM_PROVIDER),
  VENICE_INFERENCE_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().min(1).optional(),

  // Node identity
  NODE_ID: z.string().default('verifier-01'),

  // Runtime
  PORT: z.coerce.number().default(8080),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(5),

  // Coordination API (used to scan for existing SUBMITTED deals on startup)
  API_BASE_URL: z.string().url().optional(),
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

  if (!apiKey) {
    console.error(`❌ Missing API key for LLM provider "${env.LLM_PROVIDER}"`);
    process.exit(1);
  }

  return {
    ...env,
    LLM_API_KEY: apiKey,
    LLM_BASE_URL: env.LLM_BASE_URL ?? providerDefaults.baseURL,
    LLM_MODEL: env.LLM_MODEL ?? providerDefaults.model,
  };
}

export const config = loadConfig();
export type Config = typeof config;

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Blockchain
  RPC_URL: z.string().url().default('https://sepolia.base.org'),
  CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a valid address'),
  PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 32-byte hex private key'),

  // IPFS
  IPFS_GATEWAY: z.string().url().default('https://gateway.pinata.cloud'),

  // LLM (OpenAI-compatible — defaults to Venice)
  VENICE_INFERENCE_KEY: z.string().min(1),
  LLM_BASE_URL: z
    .string()
    .url()
    .default('https://api.venice.ai/api/v1'),
  LLM_MODEL: z.string().default('zai-org-glm-4.7'),

  // Node identity
  NODE_ID: z.string().default('verifier-01'),

  // Runtime
  PORT: z.coerce.number().default(8080),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(5),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Blockchain
  RPC_URL: z.string().url().default('https://sepolia.base.org'),
  CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a valid address'),
  PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 32-byte hex private key'),

  // IPFS
  IPFS_GATEWAY: z.string().url().default('https://gateway.pinata.cloud'),

  // LLM (OpenAI-compatible — defaults to Gemini)
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z
    .string()
    .url()
    .default('https://generativelanguage.googleapis.com/v1beta/openai'),
  LLM_MODEL: z.string().default('gemini-2.5-flash-preview-05-20'),

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

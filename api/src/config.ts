import { z } from 'zod';
import {
  DEALFORGE_ADDRESS_BASE_SEPOLIA,
  DEALFORGE_ADDRESS_BASE_MAINNET,
} from '../../shared/abis/DealForge';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // LLM inference (default: Venice OpenAI-compatible endpoint)
  VENICE_INFERENCE_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url().default('https://api.venice.ai/api/v1'),
  LLM_MODEL: z.string().default('zai-org-glm-4.7'),

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

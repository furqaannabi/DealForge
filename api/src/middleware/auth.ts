/**
 * EIP-712 Authentication Middleware
 *
 * Agents prove wallet ownership by signing a typed challenge — no passwords,
 * no API keys. The signature is verified server-side with ethers.js.
 *
 * Flow:
 *   1. GET  /auth/challenge?address=0x...  → {address, nonce, issued_at}
 *   2. Agent signs the challenge with EIP-712 typed data
 *   3. POST /auth/verify  {address, signature, nonce, issued_at}
 *   4. Subsequent requests include  x-agent-address  header
 */

import type { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { randomBytes } from 'crypto';
import { db } from '../db/client';

// ─── EIP-712 domain & type ──────────────────────────────────────────────────

const DOMAIN = {
  name: 'DealForge',
  version: '1',
  chainId: 84532, // Base Sepolia
} as const;

const CHALLENGE_TYPE = {
  AuthChallenge: [
    { name: 'address', type: 'address' },
    { name: 'nonce',   type: 'string' },
    { name: 'issued_at', type: 'string' },
  ],
};

// ─── Challenge generation ───────────────────────────────────────────────────

export async function issueChallenge(req: Request, res: Response): Promise<void> {
  const { address } = req.query as { address?: string };
  if (!address || !ethers.isAddress(address)) {
    res.status(400).json({ error: 'Invalid Ethereum address' });
    return;
  }

  const nonce     = randomBytes(16).toString('hex');
  const issued_at = new Date().toISOString();

  await db.authNonce.create({
    data: { address: address.toLowerCase(), nonce },
  });

  res.json({ address: address.toLowerCase(), nonce, issued_at });
}

// ─── Signature verification ─────────────────────────────────────────────────

export async function verifySignature(req: Request, res: Response): Promise<void> {
  const { address, signature, nonce, issued_at } = req.body as {
    address?: string;
    signature?: string;
    nonce?: string;
    issued_at?: string;
  };

  if (!address || !ethers.isAddress(address) || !signature || !nonce || !issued_at) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const nonceRecord = await db.authNonce.findUnique({
    where: { address_nonce: { address: address.toLowerCase(), nonce } },
  });

  if (!nonceRecord || nonceRecord.used) {
    res.status(401).json({ error: 'Invalid or expired nonce' });
    return;
  }

  // Nonces expire after 10 minutes
  if (Date.now() - nonceRecord.issuedAt.getTime() > 10 * 60 * 1000) {
    res.status(401).json({ error: 'Nonce expired' });
    return;
  }

  const challenge = { address: address.toLowerCase(), nonce, issued_at };
  try {
    const recovered = ethers.verifyTypedData(DOMAIN, CHALLENGE_TYPE, challenge, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      res.status(401).json({ error: 'Signature verification failed' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Malformed signature' });
    return;
  }

  await db.authNonce.update({
    where: { address_nonce: { address: address.toLowerCase(), nonce } },
    data: { used: true },
  });

  res.json({ verified: true, address: address.toLowerCase() });
}

// ─── Request middleware ─────────────────────────────────────────────────────

/** Soft auth — populates req.agentAddress if header present and valid. */
export function extractAgent(req: Request, _res: Response, next: NextFunction): void {
  const addr = req.headers['x-agent-address'] as string | undefined;
  if (addr && ethers.isAddress(addr)) {
    req.agentAddress = addr.toLowerCase();
  }
  next();
}

/** Hard auth guard — rejects 401 if x-agent-address is missing. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.agentAddress) {
    res.status(401).json({ error: 'Missing or invalid x-agent-address header' });
    return;
  }
  next();
}

// ─── Augment express Request ────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      agentAddress?: string;
    }
  }
}

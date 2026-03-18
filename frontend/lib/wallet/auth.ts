import type { WalletClient } from 'viem';
import { DEALFORGE_CHAIN_ID } from '@/lib/config';
import { getAuthChallenge, verifyAuthChallenge } from '@/lib/api/auth';

const VERIFIED_WALLET_STORAGE_KEY = 'dealforge:verified-wallet';

export function isVerifiedWallet(address: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(VERIFIED_WALLET_STORAGE_KEY) === address.toLowerCase();
}

export function persistVerifiedWallet(address: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(VERIFIED_WALLET_STORAGE_KEY, address.toLowerCase());
}

export async function verifyWalletOwnership(address: string, walletClient: WalletClient) {
  const normalizedAddress = address.toLowerCase();
  const challenge = await getAuthChallenge(normalizedAddress);

  const signature = await walletClient.signTypedData({
    account: walletClient.account!,
    domain: {
      name: 'DealForge',
      version: '1',
      chainId: DEALFORGE_CHAIN_ID,
    },
    types: {
      AuthChallenge: [
        { name: 'address', type: 'address' },
        { name: 'nonce', type: 'string' },
        { name: 'issued_at', type: 'string' },
      ],
    },
    primaryType: 'AuthChallenge',
    message: {
      address: normalizedAddress as `0x${string}`,
      nonce: challenge.nonce,
      issued_at: challenge.issued_at,
    },
  });

  const response = await verifyAuthChallenge({
    address: normalizedAddress,
    nonce: challenge.nonce,
    issued_at: challenge.issued_at,
    signature,
  });

  if (response.verified) {
    persistVerifiedWallet(normalizedAddress);
  }

  return response;
}

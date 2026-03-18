'use client';

import { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import {
  DEALFORGE_CHAIN_ID,
  WALLETCONNECT_PROJECT_ID,
} from '@/lib/config';

const activeChain = DEALFORGE_CHAIN_ID === 8453 ? base : baseSepolia;

const config = createConfig(
  getDefaultConfig({
    appName: 'DealForge',
    appDescription: 'Autonomous Agent-to-Agent Deal Protocol',
    appUrl: 'https://dealforge.local',
    walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
    chains: [activeChain],
    transports: {
      [activeChain.id]: http(),
    },
    ssr: true,
  }),
);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          mode="dark"
          theme="midnight"
          options={{
            embedGoogleFonts: false,
            initialChainId: activeChain.id,
            enforceSupportedChains: true,
            hideBalance: true,
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

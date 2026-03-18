import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { Web3Provider } from '@/components/web3-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'DealForge Command Center',
  description: 'Autonomous Agent-to-Agent Deal Protocol terminal interface.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>
          <AppShell>{children}</AppShell>
        </Web3Provider>
      </body>
    </html>
  );
}

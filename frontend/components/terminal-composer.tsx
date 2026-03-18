'use client';

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Delegation } from '@metamask/smart-accounts-kit';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useChainId, useWalletClient } from 'wagmi';
import {
  DEALFORGE_CHAIN_ID,
  DEALFORGE_CHAIN_NAME,
  DEALFORGE_CONTRACT_ADDRESS,
} from '@/lib/config';
import { registerAgent } from '@/lib/api/agents';
import { createJob } from '@/lib/api/jobs';
import { commandCatalog, initialTerminalLines, type TerminalLine } from '@/lib/mock-data';
import {
  canSignDelegation,
  formatDelegationPreview,
  signSettlementDelegation,
} from '@/lib/wallet/delegation';
import { isVerifiedWallet, verifyWalletOwnership } from '@/lib/wallet/auth';

const DEFAULT_COMMAND = 'summarize this research paper\nbudget 3 USDC\ndeadline 20 minutes';

type PendingTerminalLine = {
  kind: TerminalLine['kind'];
  text: string;
};

type WalletState = 'disconnected' | 'connected' | 'verifying' | 'verified';

function buildResponse(command: string) {
  const normalized = command.toLowerCase();

  if (normalized.includes('show active deals')) {
    return [
      'Querying active deals from the coordination API mirror.',
      'Deal #42 executing, Deal #41 result submitted, Deal #39 settled.',
    ];
  }

  if (normalized.includes('check escrow status')) {
    return [
      'Escrow locked for Deal #42 on Base.',
      'Confirmation finalized. Result submission still pending.',
    ];
  }

  return [
    'Searching worker agents...',
    'Found summarizer.agent.eth, research.agent.eth, and data.agent.eth.',
    'Negotiation started.',
    'Agreement reached at 2.5 USDC / 20 minutes.',
    'Escrow ready for creation on Base.',
  ];
}

function toProtocolWei(value: number) {
  const [whole, fraction = ''] = value.toString().split('.');
  const paddedFraction = `${fraction}000000000000000000`.slice(0, 18);
  return `${whole || '0'}${paddedFraction}`.replace(/^0+(?=\d)/, '');
}

function parseBudget(command: string) {
  const match = command.match(/budget\s+(\d+(\.\d+)?)/i);
  return match ? Number(match[1]) : 3;
}

function parseDeadline(command: string) {
  const minuteMatch = command.match(/deadline\s+(\d+)\s*(minute|min)/i);
  if (minuteMatch) {
    return Number(minuteMatch[1]) * 60;
  }

  const hourMatch = command.match(/deadline\s+(\d+)\s*(hour|hr)/i);
  if (hourMatch) {
    return Number(hourMatch[1]) * 60 * 60;
  }

  return 20 * 60;
}

function buildJobPayload(command: string, attachments: File[]) {
  const firstLine = command.split('\n')[0]?.trim() || 'New autonomous task';
  const budget = parseBudget(command);
  const deadlineSeconds = parseDeadline(command);
  const attachmentText =
    attachments.length > 0 ? `\nAttached files: ${attachments.map((file) => file.name).join(', ')}` : '';

  return {
    title: firstLine.slice(0, 255),
    description: `${command}${attachmentText}`,
    max_budget: toProtocolWei(budget),
    deadline: Math.floor(Date.now() / 1000) + deadlineSeconds,
    category: firstLine.toLowerCase().includes('dataset') ? 'data-analysis' : 'research',
  };
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function Typewriter({ text }: { text: string }) {
  const [visible, setVisible] = useState('');

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisible(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(timer);
      }
    }, 14);

    return () => window.clearInterval(timer);
  }, [text]);

  return <span>{visible}</span>;
}

export function TerminalComposer() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const [input, setInput] = useState(DEFAULT_COMMAND);
  const [lines, setLines] = useState<TerminalLine[]>(initialTerminalLines);
  const [queuedResponse, setQueuedResponse] = useState<PendingTerminalLine[]>([]);
  const [activeTypingLine, setActiveTypingLine] = useState<PendingTerminalLine | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [walletState, setWalletState] = useState<WalletState>('disconnected');
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [delegation, setDelegation] = useState<Delegation | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const terminalRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const seed = input.split('\n')[0].trim().toLowerCase();
    return seed ? commandCatalog.filter((item) => item.includes(seed)).slice(0, 4) : commandCatalog;
  }, [input]);

  const isVerified = address ? walletState === 'verified' || isVerifiedWallet(address) : false;
  const wrongChain = isConnected ? chainId !== DEALFORGE_CHAIN_ID : false;
  const delegationPreview = delegation ? formatDelegationPreview(delegation) : '';

  useEffect(() => {
    if (!isConnected || !address) {
      setWalletState('disconnected');
      return;
    }

    setWalletState(isVerifiedWallet(address) ? 'verified' : 'connected');
  }, [address, isConnected]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines, queuedResponse, activeTypingLine]);

  useEffect(() => {
    if (activeTypingLine || queuedResponse.length === 0) {
      return;
    }

    const nextLine = queuedResponse[0];
    setActiveTypingLine(nextLine);

    const timer = window.setTimeout(() => {
      setLines((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          kind: nextLine.kind,
          text: nextLine.text,
        },
      ]);
      setQueuedResponse((current) => current.slice(1));
      setActiveTypingLine(null);
    }, nextLine.text.length * 14 + 240);

    return () => window.clearTimeout(timer);
  }, [activeTypingLine, queuedResponse]);

  const enqueueLines = (response: Array<string | PendingTerminalLine>) => {
    const normalized = response.map((entry) =>
      typeof entry === 'string' ? { kind: 'agent' as const, text: entry } : entry,
    );
    setQueuedResponse((current) => [...current, ...normalized]);
  };

  const appendLine = (kind: TerminalLine['kind'], text: string) => {
    setLines((current) => [...current, { id: crypto.randomUUID(), kind, text }]);
  };

  const authenticateWallet = async (walletAddress: string) => {
    if (!walletClient) {
      throw new Error('Wallet client unavailable. Reconnect your wallet and try again.');
    }

    if (isVerifiedWallet(walletAddress)) {
      setWalletState('verified');
      return;
    }

    setWalletState('verifying');
    await verifyWalletOwnership(walletAddress, walletClient);
    setWalletState('verified');
  };

  const copyDelegation = async () => {
    if (!delegationPreview) {
      return;
    }

    await navigator.clipboard.writeText(delegationPreview);
    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1600);
  };

  const runCommand = async (raw: string) => {
    const command = raw.trim();
    if (!command || isSubmitting) {
      return;
    }

    setLines((current) => [...current, { id: crypto.randomUUID(), kind: 'command', text: command }]);

    if (!isConnected || !address || !walletClient) {
      enqueueLines([
        'Connect your wallet to continue.',
        'Use the ConnectKit button to connect MetaMask or another supported wallet before posting the job.',
        ...buildResponse(command),
      ]);
      return;
    }

    setIsSubmitting(true);
    setWalletError(null);

    try {
      if (!isVerifiedWallet(address)) {
        appendLine('agent', 'Verifying wallet ownership with DealForge...');
        await authenticateWallet(address);
        enqueueLines([{ kind: 'success', text: 'Wallet verified for DealForge API access.' }]);
      } else {
        setWalletState('verified');
      }

      appendLine('agent', 'Registering your agent profile...');
      await registerAgent(address.toLowerCase(), {
        capabilities: ['research', 'summarization', 'data-analysis'],
        pricing_policy: {
          min_price_wei: '10000000000000000',
          max_price_wei: '1000000000000000000',
          preferred_deadline_hours: 24,
        },
        description: 'Task agent controlled from the DealForge workspace.',
        ens_name: 'task.agent.eth',
      });

      appendLine('agent', 'Posting job to the coordination API...');
      const payload = buildJobPayload(command, attachments);
      const createdJob = await createJob(payload, address.toLowerCase());
      const resolvedJobId = createdJob.id ?? 'pending-id';
      setLastJobId(resolvedJobId);
      setAttachments([]);

      enqueueLines([
        `Job ${resolvedJobId} posted successfully.`,
        `Budget cap set to ${parseBudget(command)} USDC equivalent with ${payload.category} routing.`,
      ]);

      if (canSignDelegation()) {
        appendLine('agent', 'Opening your wallet to sign settlement delegation...');
        const signedDelegation = await signSettlementDelegation(resolvedJobId, address, walletClient);

        if (signedDelegation) {
          setDelegation(signedDelegation.delegation);
          enqueueLines([
            { kind: 'success', text: 'Delegation signed in MetaMask.' },
            `Scoped to settleDeal() on ${formatAddress(DEALFORGE_CONTRACT_ADDRESS)}.`,
            'Share this signed delegation with the task agent backend to allow autonomous settlement.',
          ]);
        } else {
          enqueueLines([
            'Delegation signing is not configured yet in this environment.',
            'Set contract and caveat addresses in the frontend env to enable wallet delegation.',
          ]);
        }
      } else {
        enqueueLines([
          'Delegation config missing, so the job was posted without autonomous settlement authority.',
        ]);
      }

      enqueueLines(buildResponse(command));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setWalletError(message);
      enqueueLines([
        `Wallet flow failed: ${message}`,
        'Switching back to local terminal simulation so you can keep exploring the UI.',
        ...buildResponse(command),
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    setAttachments(nextFiles);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runCommand(input);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab' && suggestions.length > 0) {
      event.preventDefault();
      setInput(suggestions[0]);
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void runCommand(input);
    }
  };

  return (
    <section className="panel terminal-panel slide-up">
      <div className="terminal-toolbar">
        <div className="wallet-strip">
          <div className="wallet-summary">
            <span className="eyebrow">Wallet</span>
            <strong>{address ? formatAddress(address) : 'No wallet connected'}</strong>
          </div>
          <div className="wallet-status-row">
            <span className={`pill ${walletState === 'verified' ? 'pill-live' : ''}`}>
              {walletState === 'verified' ? 'Verified' : walletState === 'connected' ? 'Connected' : walletState === 'verifying' ? 'Verifying' : 'Not connected'}
            </span>
            <span className={`pill ${wrongChain ? 'pill-warning' : ''}`}>
              {isConnected ? `${DEALFORGE_CHAIN_NAME} ${chainId === DEALFORGE_CHAIN_ID ? 'ready' : `expected ${DEALFORGE_CHAIN_ID}`}` : DEALFORGE_CHAIN_NAME}
            </span>
            <ConnectKitButton.Custom>
              {({ show, isConnected: walletConnected, truncatedAddress }) => (
                <button type="button" className="button" onClick={show}>
                  {walletConnected ? truncatedAddress ?? 'Wallet' : 'Connect wallet'}
                </button>
              )}
            </ConnectKitButton.Custom>
          </div>
        </div>
      </div>

      {walletError ? <p className="terminal-inline-note">{walletError}</p> : null}

      <div ref={terminalRef} className="terminal-surface">
        {lines.map((line) => (
          <div key={line.id} className={`terminal-row ${line.kind}`}>
            <span className="terminal-prefix">{line.kind === 'command' ? '>' : '$'}</span>
            <span>{line.text}</span>
          </div>
        ))}

        {activeTypingLine ? (
          <div className={`terminal-row ${activeTypingLine.kind}`}>
            <span className="terminal-prefix">{activeTypingLine.kind === 'command' ? '>' : '$'}</span>
            <Typewriter text={activeTypingLine.text} />
          </div>
        ) : null}
      </div>

      <form className="terminal-form" onSubmit={onSubmit}>
        <label htmlFor="terminal-input" className="label">
          Prompt
        </label>

        {attachments.length > 0 ? (
          <div className="attachment-preview">
            {attachments.map((file) => (
              <span key={`${file.name}-${file.lastModified}`} className="attachment-chip">
                {file.name}
              </span>
            ))}
          </div>
        ) : null}

        <textarea
          id="terminal-input"
          className="terminal-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          rows={5}
          spellCheck={false}
        />

        <div className="attachment-bar">
          <label htmlFor="terminal-files" className="button">
            Add files
          </label>
          <input
            id="terminal-files"
            className="sr-only"
            type="file"
            multiple
            accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,.png,.jpg,.jpeg,.webp"
            onChange={onFilesSelected}
          />
          <span className="attachment-hint">Attach PDFs, docs, CSVs, images, or datasets.</span>
        </div>

        <div className="suggestion-row">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="chip" onClick={() => setInput(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>

        <div className="form-foot">
          <span>{isVerified ? 'Wallet verified. You can post and sign from here.' : 'Connect your wallet to post jobs and sign delegation intent.'}</span>
          <button type="submit" className="button button-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Working...' : 'Run command'}
          </button>
        </div>
      </form>

      {delegation ? (
        <div className="delegation-panel">
          <div className="delegation-head">
            <div>
              <p className="eyebrow">Signed delegation</p>
              <h2>Autonomous settlement intent</h2>
            </div>
            <button type="button" className="button" onClick={() => void copyDelegation()}>
              {copyState === 'copied' ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <p className="delegation-lead">
            This payload is signed in the browser and scoped for the DealForge settlement contract. Hand it to your backend or agent runner to redeem later.
          </p>
          <div className="delegation-meta">
            <span className="pill pill-live">Job {lastJobId ?? 'pending'}</span>
            <span className="pill">Chain {DEALFORGE_CHAIN_NAME}</span>
          </div>
          <pre className="delegation-code">{delegationPreview}</pre>
        </div>
      ) : null}
    </section>
  );
}

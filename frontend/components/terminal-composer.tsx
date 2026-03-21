'use client';

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useChainId, useWalletClient } from 'wagmi';
import { DEALFORGE_CHAIN_ID, DEALFORGE_CHAIN_NAME } from '@/lib/config';
import { registerAgent } from '@/lib/api/agents';
import { createJob, evaluateProposal, listJobProposals } from '@/lib/api/jobs';
import { commandCatalog, initialTerminalLines, type TerminalLine } from '@/lib/mock-data';
import { createDealForAcceptedProposal } from '@/lib/onchain/dealforge';
import { canSignDelegation, signEscrowFundingDelegation } from '@/lib/wallet/delegation';
import { isVerifiedWallet, verifyWalletOwnership } from '@/lib/wallet/auth';
import type { ApiProposal } from '@/lib/types/api';

const DEFAULT_COMMAND = 'summarize this research paper\nbudget 3 USDC\ndeadline 20 minutes';

type PendingTerminalLine = {
  kind: TerminalLine['kind'];
  text: string;
};

type WalletState = 'disconnected' | 'connected';
type ProposalState = 'idle' | 'loading' | 'error';

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

function formatWeiAsEth(value: string) {
  try {
    const wei = BigInt(value);
    const base = BigInt('1000000000000000000');
    const whole = wei / base;
    const fraction = (wei % base).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    const formatted = fraction ? `${whole.toString()}.${fraction}` : whole.toString();
    return `${formatted} ETH`;
  } catch {
    return `${value} wei`;
  }
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
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ApiProposal[]>([]);
  const [proposalState, setProposalState] = useState<ProposalState>('idle');
  const [evaluatingProposalId, setEvaluatingProposalId] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const seenProposalIdsRef = useRef<Set<string>>(new Set());
  const proposalStatusesRef = useRef<Map<string, ApiProposal['status']>>(new Map());
  const creatingDealProposalIdsRef = useRef<Set<string>>(new Set());

  const suggestions = useMemo(() => {
    const seed = input.split('\n')[0].trim().toLowerCase();
    return seed ? commandCatalog.filter((item) => item.includes(seed)).slice(0, 4) : commandCatalog;
  }, [input]);

  const wrongChain = isConnected ? chainId !== DEALFORGE_CHAIN_ID : false;

  useEffect(() => {
    if (!isConnected || !address) {
      setWalletState('disconnected');
      return;
    }

    setWalletState('connected');
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

  const createDealFromAcceptedProposal = async (proposal: ApiProposal) => {
    if (!activeJobId) {
      return;
    }

    if (!address || !walletClient) {
      appendLine('agent', 'Accepted proposal detected, but the task-agent wallet client is unavailable for createDeal().');
      return;
    }

    if (creatingDealProposalIdsRef.current.has(proposal.id)) {
      return;
    }

    creatingDealProposalIdsRef.current.add(proposal.id);
    appendLine('success', `Proposal ${proposal.id} accepted. Opening wallet to create the on-chain deal...`);

    try {
      const createdDeal = await createDealForAcceptedProposal({
        walletClient,
        agentAddress: address.toLowerCase(),
        jobId: activeJobId,
        proposal,
      });

      appendLine('agent', `Debug createDeal connected account: ${createdDeal.connectedAccount}`);
      appendLine('agent', `Debug DealCreated payer: ${createdDeal.payer}`);
      appendLine('agent', `Debug /deals x-agent-address: ${createdDeal.mirrorHeaderAddress}`);
      appendLine(
        'success',
        `Deal #${createdDeal.dealId} created on-chain and mirrored to the API. Tx: ${createdDeal.txHash}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      appendLine('agent', `createDeal() failed for accepted proposal ${proposal.id}: ${message}`);
    }
  };

  useEffect(() => {
    if (!activeJobId) {
      setProposals([]);
      seenProposalIdsRef.current = new Set();
      proposalStatusesRef.current = new Map();
      setProposalState('idle');
      return;
    }

    const jobId = activeJobId;
    let active = true;

    async function loadProposals(isInitial = false) {
      try {
        if (isInitial) {
          setProposalState('loading');
        }

        const response = await listJobProposals(jobId);
        if (!active) {
          return;
        }

        setProposals(response.proposals);
        setProposalState('idle');

        const nextSeen = new Set(seenProposalIdsRef.current);
        const nextStatuses = new Map(proposalStatusesRef.current);
        for (const proposal of response.proposals) {
          const currentStatus = proposal.status;
          const previousStatus = nextStatuses.get(proposal.id);
          if (!nextSeen.has(proposal.id)) {
      const workerAddress = proposal.worker_address ?? proposal.workerAddress ?? 'unknown-worker';
      const workerLabel = proposal.worker?.ens_name ?? proposal.worker?.ensName ?? formatAddress(workerAddress);
            const price = proposal.proposed_price ?? proposal.proposedPrice ?? '0';
            appendLine('agent', `${workerLabel} submitted proposal ${proposal.id} for ${formatWeiAsEth(price)}.`);
            appendLine('agent', `Review proposal ${proposal.id} below and accept it to continue negotiation.`);
            nextSeen.add(proposal.id);
          } else if (previousStatus && previousStatus !== currentStatus) {
            if (currentStatus === 'countered') {
              appendLine('agent', `Proposal ${proposal.id} was countered. You can still accept the counter-offer below.`);
            } else if (currentStatus === 'accepted') {
              appendLine('success', `Proposal ${proposal.id} is now accepted.`);
              appendLine('agent', `Use the Create deal button below proposal ${proposal.id} to call createDeal() on-chain.`);
            } else if (currentStatus === 'rejected') {
              appendLine('agent', `Proposal ${proposal.id} was rejected.`);
            }
          }
          nextStatuses.set(proposal.id, currentStatus);
        }
        seenProposalIdsRef.current = nextSeen;
        proposalStatusesRef.current = nextStatuses;
      } catch {
        if (active) {
          setProposalState('error');
        }
      }
    }

    void loadProposals(true);
    const interval = window.setInterval(() => {
      void loadProposals();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [activeJobId]);

  const onAcceptProposal = async (proposal: ApiProposal) => {
    if (!activeJobId || evaluatingProposalId) {
      return;
    }

    setEvaluatingProposalId(proposal.id);
    appendLine('agent', `Evaluating proposal ${proposal.id}...`);

    try {
      if (!address) {
        throw new Error('Connect the task-agent wallet before evaluating proposals.');
      }

      const evaluation = await evaluateProposal(activeJobId, proposal.id, address.toLowerCase());
      appendLine('agent', `NegotiationEngine decision for ${proposal.id}: ${evaluation.decision}.`);
      appendLine('agent', evaluation.reasoning);

      const response = await listJobProposals(activeJobId);
      setProposals(response.proposals);

      if (evaluation.decision === 'accept') {
        appendLine('success', `Proposal ${proposal.id} accepted.`);
        appendLine('agent', `Create the on-chain deal from the accepted proposal card below.`);
      } else if (evaluation.decision === 'counter') {
        appendLine('agent', `Proposal ${proposal.id} was countered. Review the updated negotiation state.`);
      } else {
        appendLine('agent', `Proposal ${proposal.id} was rejected.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      appendLine('agent', `Proposal evaluation failed: ${message}`);
    } finally {
      setEvaluatingProposalId(null);
    }
  };

  const runCommand = async (raw: string) => {
    const command = raw.trim();
    if (!command || isSubmitting) {
      return;
    }

    setLines((current) => [...current, { id: crypto.randomUUID(), kind: 'command', text: command }]);

    if (!isConnected || !address) {
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
      let signedDelegation = null;
      const payload = buildJobPayload(command, attachments);
      if (!walletClient) {
        throw new Error('Wallet client unavailable. Reconnect your wallet and try again.');
      }

      if (wrongChain) {
        throw new Error(`Switch your wallet to ${DEALFORGE_CHAIN_NAME} before posting this job.`);
      }

      if (!isVerifiedWallet(address)) {
        appendLine('agent', `Requesting auth challenge for ${formatAddress(address)}...`);
        const auth = await verifyWalletOwnership(address, walletClient);
        if (!auth.verified) {
          throw new Error('Wallet verification failed.');
        }
        enqueueLines([{ kind: 'success', text: 'Wallet ownership verified with DealForge.' }]);
      }

      appendLine('agent', `Registering ${formatAddress(address)} as the task agent...`);
      await registerAgent(address.toLowerCase(), {
        capabilities: ['task-orchestration', 'deal-negotiation', 'escrow-funding'],
        pricing_policy: {
          min_price_wei: '0',
          max_price_wei: payload.max_budget,
          preferred_deadline_hours: 24,
        },
        description: 'Frontend task agent profile used for job posting and proposal management.',
      });
      enqueueLines([{ kind: 'success', text: 'Task agent profile registered.' }]);

      if (canSignDelegation(address)) {
        appendLine(
          'agent',
          `Opening your wallet to authorize task agent ${formatAddress(address)} to spend up to ${formatWeiAsEth(payload.max_budget)} through DelegationManager...`,
        );
        signedDelegation = await signEscrowFundingDelegation({
          userAddress: address,
          delegateAddress: address.toLowerCase(),
          maxAmountWei: BigInt(payload.max_budget),
        });
        if (!signedDelegation) {
          throw new Error('Delegation signing is not configured in this frontend environment.');
        }
        enqueueLines([{ kind: 'success', text: 'Budget delegation signed by the connected wallet.' }]);
      }

      appendLine('agent', `Posting job through task agent ${formatAddress(address)}...`);
      const createdJob = await createJob(
        {
          ...payload,
          ...(signedDelegation ? { delegation: signedDelegation.delegation as never } : {}),
        },
        address.toLowerCase(),
      );
      const resolvedJobId = createdJob.id ?? 'pending-id';
      setActiveJobId(createdJob.id ?? null);
      seenProposalIdsRef.current = new Set();
      proposalStatusesRef.current = new Map();
      setAttachments([]);

      enqueueLines([
        `Job ${resolvedJobId} posted successfully.`,
        `Budget cap set to ${parseBudget(command)} USDC equivalent with ${payload.category} routing.`,
        signedDelegation
          ? 'The signed budget delegation is stored with the job so the task agent can later call DelegationManager and lock escrow through the existing createDeal() flow.'
          : 'Job posted without a MetaMask budget delegation because delegation signing is not configured here.',
      ]);

      enqueueLines([
        'Watching this job for incoming worker proposals...',
        'New proposals will appear below with an inline accept action.',
      ]);
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
          <span className={`pill ${walletState === 'connected' ? 'pill-live' : ''}`}>
            {walletState === 'connected' ? 'Connected' : 'Not connected'}
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

      {activeJobId ? (
        <section className="delegation-panel">
          <div className="delegation-head">
            <div>
              <p className="eyebrow">Live proposals</p>
              <h2>Job {activeJobId}</h2>
            </div>
            <span className="pill">
              {proposalState === 'loading'
                ? 'Loading proposals'
                : proposalState === 'error'
                  ? 'Proposal feed unavailable'
                  : `${proposals.length} proposal${proposals.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <p className="delegation-lead">
            Worker proposals appear here as they are submitted. Accepting a proposal calls the NegotiationEngine evaluation endpoint for this job with the connected task-agent wallet.
          </p>
          {proposalState === 'loading' ? <div className="result-state">Waiting for worker proposals...</div> : null}
          {proposalState === 'error' ? (
            <div className="result-state">We couldn't refresh proposals right now.</div>
          ) : null}
          {proposalState !== 'error' && proposals.length === 0 ? (
            <div className="result-state">No proposals yet. Keep this terminal open and we'll stream new submissions here.</div>
          ) : null}
          {proposals.length > 0 ? (
            <div className="proposal-list">
              {proposals.map((proposal) => {
                const workerAddress = proposal.worker_address ?? proposal.workerAddress ?? 'unknown-worker';
                const workerLabel = proposal.worker?.ens_name ?? proposal.worker?.ensName ?? formatAddress(workerAddress);
                const price = proposal.proposed_price ?? proposal.proposedPrice ?? '0';
                const deadline = proposal.proposed_deadline ?? proposal.proposedDeadline ?? 'n/a';

                return (
                  <article key={proposal.id} className="proposal-card">
                    <div className="proposal-card-head">
                      <div>
                        <p className="eyebrow">Proposal {proposal.id}</p>
                        <strong>{workerLabel}</strong>
                      </div>
                      <span className="pill">{proposal.status}</span>
                    </div>
                    <div className="proposal-meta">
                      <span>Price {formatWeiAsEth(price)}</span>
                      <span>Deadline {String(deadline)}</span>
                    </div>
                    <p className="delegation-lead">{proposal.message}</p>
                          {proposal.status === 'pending' || proposal.status === 'countered' ? (
                            <div className="deal-actions">
                              <button
                                type="button"
                          className="button button-primary"
                          onClick={() => void onAcceptProposal(proposal)}
                          disabled={evaluatingProposalId === proposal.id}
                        >
                                {evaluatingProposalId === proposal.id
                                  ? 'Evaluating...'
                                  : proposal.status === 'countered'
                                    ? 'Accept counter-offer'
                                    : 'Accept proposal'}
                              </button>
                            </div>
                          ) : proposal.status === 'accepted' ? (
                            <div className="deal-actions">
                              <button
                                type="button"
                                className="button button-primary"
                                onClick={() => void createDealFromAcceptedProposal(proposal)}
                                disabled={creatingDealProposalIdsRef.current.has(proposal.id)}
                              >
                                {creatingDealProposalIdsRef.current.has(proposal.id) ? 'Creating deal...' : 'Create deal'}
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

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
          <span>
            {isConnected
              ? 'Wallet connected. Posting uses the task agent; your wallet signs a one-time spend cap for the agent wallet.'
              : 'Connect your wallet to post jobs and sign an escrow funding delegation.'}
          </span>
          <button type="submit" className="button button-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Working...' : 'Run command'}
          </button>
        </div>
      </form>

    </section>
  );
}

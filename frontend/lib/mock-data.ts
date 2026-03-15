export type DealState =
  | 'NEGOTIATING'
  | 'ESCROW_CREATED'
  | 'EXECUTING'
  | 'RESULT_SUBMITTED'
  | 'SETTLED'
  | 'REFUNDED'
  | 'DISPUTED';

export interface DealCardData {
  id: number;
  worker: string;
  task: string;
  escrow: string;
  status: DealState;
  deadline: string;
  txHash: string;
  progress: number;
  confirmation: 'Pending' | 'Confirmed' | 'Finalized';
  timeline: Array<{ label: string; complete: boolean }>;
}

export interface TerminalLine {
  id: string;
  kind: 'command' | 'system' | 'agent' | 'success';
  text: string;
}

export const commandCatalog = [
  'post job summarize_pdf',
  'analyze dataset.csv',
  'find cheapest worker',
  'show active deals',
  'check escrow status',
  'view deal 42',
];

export const initialTerminalLines: TerminalLine[] = [
  { id: '1', kind: 'system', text: 'DealForge terminal ready.' },
  { id: '2', kind: 'system', text: 'Connected to coordination API, escrow indexer, and Base relay.' },
];

export const deals: DealCardData[] = [
  {
    id: 42,
    worker: 'summarizer.agent.eth',
    task: 'Summarize a research paper with key arguments, risks, and open questions.',
    escrow: '2.5 USDC',
    status: 'EXECUTING',
    deadline: '19m remaining',
    txHash: '0x91a723bf89b4d1150a56bf63a9608f847d02cb44c9c0d02a8d82ca84531ad3fe',
    progress: 72,
    confirmation: 'Confirmed',
    timeline: [
      { label: 'Deal Created', complete: true },
      { label: 'Escrow Locked', complete: true },
      { label: 'Worker Executing', complete: true },
      { label: 'Result Submitted', complete: false },
      { label: 'Payment Released', complete: false },
    ],
  },
  {
    id: 41,
    worker: 'research.agent.eth',
    task: 'Analyze market map and return ranked execution options.',
    escrow: '4.0 USDC',
    status: 'RESULT_SUBMITTED',
    deadline: '4m remaining',
    txHash: '0x8c55c667dc688806f9b5ed4c3d842028c7f33f8cf8cd41af74ae915b83fc11aa',
    progress: 88,
    confirmation: 'Finalized',
    timeline: [
      { label: 'Deal Created', complete: true },
      { label: 'Escrow Locked', complete: true },
      { label: 'Worker Executing', complete: true },
      { label: 'Result Submitted', complete: true },
      { label: 'Payment Released', complete: false },
    ],
  },
  {
    id: 39,
    worker: 'data.agent.eth',
    task: 'Clean dataset anomalies and upload normalized output to IPFS.',
    escrow: '1.7 USDC',
    status: 'SETTLED',
    deadline: 'Completed',
    txHash: '0xa22cb7d284c31cf78e59f1af8cb1e13c68f938b5f6808d2f9c7130524d7b8bf0',
    progress: 100,
    confirmation: 'Finalized',
    timeline: [
      { label: 'Deal Created', complete: true },
      { label: 'Escrow Locked', complete: true },
      { label: 'Worker Executing', complete: true },
      { label: 'Result Submitted', complete: true },
      { label: 'Payment Released', complete: true },
    ],
  },
];

export function formatTxHash(txHash: string) {
  return `${txHash.slice(0, 8)}...${txHash.slice(-4)}`;
}

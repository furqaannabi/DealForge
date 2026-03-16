// ─── Verification plans ───────────────────────────────────────────────────────
// Embedded in TaskDescription.verificationPlan by the Task Agent at job creation.

export interface SchemaCheckPlan {
  type: 'schema_check';
  required_fields: string[];
  min_records: number;
  random_sample?: number; // number of rows to spot-check
}

export interface LlmJudgePlan {
  type: 'llm_judge';
  criteria: string;   // natural-language evaluation criteria
  threshold: number;  // 0-100 minimum score to ACCEPT
}

export interface RandomSamplePlan {
  type: 'random_sample';
  sample_size: number;
  check_fields: string[];
}

export type VerificationPlan = SchemaCheckPlan | LlmJudgePlan | RandomSamplePlan;

// ─── IPFS content shapes ──────────────────────────────────────────────────────

export interface TaskDescription {
  task: string;
  format: string;
  constraints: string[];
  metadata: Record<string, unknown>;
  verificationPlan?: VerificationPlan;
}

export interface TaskResult {
  output: unknown;
  logs: string[];
  metrics: Record<string, unknown>;
  timestamp: string;
}

// ─── Verification output ──────────────────────────────────────────────────────

export type VoteDecision = 'ACCEPT' | 'REJECT';

export interface VerificationResult {
  decision: VoteDecision;
  score: number;      // 0-100
  reasoning: string;
  details?: Record<string, unknown>;
}

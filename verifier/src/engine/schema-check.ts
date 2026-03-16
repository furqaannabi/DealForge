import { SchemaCheckPlan, TaskResult, VerificationResult } from './types';

export function runSchemaCheck(plan: SchemaCheckPlan, result: TaskResult): VerificationResult {
  const output = result.output;

  if (!Array.isArray(output)) {
    return { decision: 'REJECT', score: 0, reasoning: 'Output is not an array of records' };
  }

  // ── Record count ─────────────────────────────────────────────────────────────
  if (output.length < plan.min_records) {
    return {
      decision: 'REJECT',
      score: 20,
      reasoning: `Record count ${output.length} is below required minimum of ${plan.min_records}`,
    };
  }

  // ── Required fields on every record ──────────────────────────────────────────
  const missingFieldSummary: string[] = [];
  for (const field of plan.required_fields) {
    const missingCount = (output as Record<string, unknown>[]).filter(
      (r) => r[field] === undefined || r[field] === null || r[field] === '',
    ).length;
    if (missingCount > 0) missingFieldSummary.push(`"${field}" missing in ${missingCount} rows`);
  }
  if (missingFieldSummary.length > 0) {
    return {
      decision: 'REJECT',
      score: 40,
      reasoning: `Required fields failed: ${missingFieldSummary.join('; ')}`,
      details: { missing_fields: missingFieldSummary },
    };
  }

  // ── Random spot-check ─────────────────────────────────────────────────────────
  if (plan.random_sample && plan.random_sample > 0) {
    const sampleSize = Math.min(plan.random_sample, output.length);
    const indices = new Set<number>();
    while (indices.size < sampleSize) indices.add(Math.floor(Math.random() * output.length));

    for (const idx of indices) {
      const row = (output as Record<string, unknown>[])[idx];
      for (const field of plan.required_fields) {
        if (row[field] === undefined || row[field] === null || row[field] === '') {
          return {
            decision: 'REJECT',
            score: 50,
            reasoning: `Random sample failed at row ${idx}: field "${field}" is empty`,
            details: { failed_row_index: idx, failed_row: row },
          };
        }
      }
    }
  }

  return {
    decision: 'ACCEPT',
    score: 100,
    reasoning: `Schema check passed: ${output.length} records with all required fields present`,
    details: { record_count: output.length, fields_checked: plan.required_fields },
  };
}

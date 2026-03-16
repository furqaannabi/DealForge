import { RandomSamplePlan, TaskResult, VerificationResult } from './types';

export function runRandomSample(plan: RandomSamplePlan, result: TaskResult): VerificationResult {
  const output = result.output;

  if (!Array.isArray(output)) {
    return { decision: 'REJECT', score: 0, reasoning: 'Output is not an array — cannot sample' };
  }

  if (output.length === 0) {
    return { decision: 'REJECT', score: 0, reasoning: 'Output array is empty' };
  }

  const sampleSize = Math.min(plan.sample_size, output.length);
  const indices = new Set<number>();
  while (indices.size < sampleSize) indices.add(Math.floor(Math.random() * output.length));

  const failures: string[] = [];
  for (const idx of indices) {
    const row = (output as Record<string, unknown>[])[idx];
    for (const field of plan.check_fields) {
      if (row[field] === undefined || row[field] === null || row[field] === '') {
        failures.push(`Row ${idx}: field "${field}" is empty`);
      }
    }
  }

  if (failures.length > 0) {
    const score = Math.max(0, Math.round(100 - (failures.length / sampleSize) * 100));
    return {
      decision: 'REJECT',
      score,
      reasoning: `Random sample failed (${failures.length}/${sampleSize} rows): ${failures.join('; ')}`,
      details: { failures, sample_size: sampleSize },
    };
  }

  return {
    decision: 'ACCEPT',
    score: 100,
    reasoning: `Random sample passed: ${sampleSize} rows checked, all fields present`,
    details: { sample_size: sampleSize, sampled_indices: [...indices] },
  };
}

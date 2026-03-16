import { TaskDescription, TaskResult, VerificationResult } from './types';
import { runSchemaCheck } from './schema-check';
import { runLlmJudge } from './llm-judge';
import { runRandomSample } from './random-sample';

/**
 * Dispatch verification to the correct strategy based on the plan embedded in
 * the task description. Falls back to a generic LLM judge if no plan is set.
 */
export async function verify(
  task: TaskDescription,
  result: TaskResult,
): Promise<VerificationResult> {
  const plan = task.verificationPlan;

  if (!plan) {
    // Default: ask the LLM whether the result satisfies the task spec
    return runLlmJudge(
      { type: 'llm_judge', criteria: 'Does the result fully satisfy the task specification?', threshold: 60 },
      task,
      result,
    );
  }

  switch (plan.type) {
    case 'schema_check':
      return runSchemaCheck(plan, result);
    case 'llm_judge':
      return runLlmJudge(plan, task, result);
    case 'random_sample':
      return runRandomSample(plan, result);
    default: {
      const exhaustive: never = plan;
      throw new Error(`Unknown verification type: ${(exhaustive as { type: string }).type}`);
    }
  }
}

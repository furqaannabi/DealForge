import OpenAI from 'openai';
import { config } from '../config';
import { LlmJudgePlan, TaskDescription, TaskResult, VerificationResult } from './types';

const client = new OpenAI({
  apiKey: config.VENICE_INFERENCE_KEY,
  baseURL: config.LLM_BASE_URL,
});

export async function runLlmJudge(
  plan: LlmJudgePlan,
  task: TaskDescription,
  result: TaskResult,
): Promise<VerificationResult> {
  const prompt = `You are a neutral, objective evaluator for an autonomous agent task completion system.

TASK SPECIFICATION:
${JSON.stringify({ task: task.task, format: task.format, constraints: task.constraints }, null, 2)}

SUBMITTED RESULT:
${JSON.stringify(result.output, null, 2)}

EVALUATION CRITERIA:
${plan.criteria}

Score the submitted result from 0 to 100 based on how well it satisfies the task specification and evaluation criteria.
A score >= ${plan.threshold} means ACCEPT (funds released to worker).
A score < ${plan.threshold} means REJECT (funds held / disputed).

Be strict but fair. A result must genuinely satisfy the task to receive a high score.

Respond ONLY with valid JSON in this exact shape:
{
  "score": <integer 0-100>,
  "decision": "ACCEPT" or "REJECT",
  "reasoning": "<concise one or two sentence explanation>"
}`;

  const response = await client.chat.completions.create({
    model: config.LLM_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1, // deterministic scoring
  });

  const raw = JSON.parse(response.choices[0].message.content ?? '{}') as {
    score?: number;
    decision?: string;
    reasoning?: string;
  };

  const score = Math.max(0, Math.min(100, Number(raw.score ?? 0)));
  // Trust the LLM decision but re-derive from threshold as a safety check
  const decision = score >= plan.threshold ? 'ACCEPT' : 'REJECT';

  return {
    decision,
    score,
    reasoning: raw.reasoning ?? 'No reasoning provided',
  };
}

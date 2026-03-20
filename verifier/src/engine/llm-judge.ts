import OpenAI from 'openai';
import { config } from '../config';
import { LlmJudgePlan, TaskDescription, TaskResult, VerificationResult } from './types';

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const GEMINI_SEARCH_MODEL = 'gemini-2.5-flash-preview-05-20';

// Inference client (Venice or Gemini)
const inferenceClient = new OpenAI({
  apiKey: config.LLM_API_KEY,
  baseURL: config.LLM_BASE_URL,
});

// Gemini client — always used for web search grounding
const geminiClient = new OpenAI({
  apiKey: config.GEMINI_API_KEY!,
  baseURL: DEFAULT_GEMINI_BASE_URL,
});

async function webSearch(query: string): Promise<string> {
  const res = await geminiClient.chat.completions.create({
    model: GEMINI_SEARCH_MODEL,
    messages: [{ role: 'user', content: `Search the web and return current factual information about: ${query}. Be concise.` }],
    stream: false,
    extra_body: { tools: [{ google_search: {} }] },
  } as Parameters<typeof geminiClient.chat.completions.create>[0]);
  return (res as { choices: { message: { content: string } }[] }).choices[0].message.content ?? '';
}

export async function runLlmJudge(
  plan: LlmJudgePlan,
  task: TaskDescription,
  result: TaskResult,
): Promise<VerificationResult> {
  // Step 1: web search for current facts about the task
  const searchContext = await webSearch(task.task).catch(() => '');

  const prompt = `You are a neutral, objective evaluator for an autonomous agent task completion system.

TASK SPECIFICATION:
${JSON.stringify({ task: task.task, format: task.format, constraints: task.constraints }, null, 2)}

CURRENT WEB SEARCH RESULTS (use this — not your training data):
${searchContext}

SUBMITTED RESULT:
${JSON.stringify(result.output, null, 2)}

EVALUATION CRITERIA:
${plan.criteria}

Score the submitted result from 0 to 100 based on the web search results and evaluation criteria.
A score >= ${plan.threshold} means ACCEPT (funds released to worker).
A score < ${plan.threshold} means REJECT (funds held / disputed).

Respond ONLY with valid JSON in this exact shape:
{
  "score": <integer 0-100>,
  "decision": "ACCEPT" or "REJECT",
  "reasoning": "<concise one or two sentence explanation>"
}`;

  const response = await inferenceClient.chat.completions.create({
    model: config.LLM_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
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

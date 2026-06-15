import type { AiConfig } from '@/types/ai';
import { sendChatCompletion, AiClientError } from '@/lib/adapters/ai/ai-client';
import type { ScreenerLatestRun } from '@/lib/application/screener/store';
import { buildSignalContexts } from './signal-context-builder';
import { decideSignal } from './decision-policy';
import type { AgentRunResult, AgentSignalDecision } from './agent-types';

export const AGENT_SYSTEM_PROMPT = `You are a read-only crypto signal agent.

Rules:
1. Do not change LONG/SHORT/WAIT from the deterministic engine.
2. Do not execute trades, mention leverage, or request exchange API keys.
3. Do not invent levels outside the provided JSON.
4. Return concise Indonesian text only.
5. If context is weak, stale, or conflicting, prefer waiting.`;

export async function runAgentOnLatest(
  latest: ScreenerLatestRun,
  aiConfig: AiConfig | null,
  options?: { topN?: number }
): Promise<AgentRunResult> {
  const topN = options?.topN ?? 5;
  const contexts = buildSignalContexts(latest.results.slice(0, topN), latest.audits);
  const decisions = contexts.map(decideSignal);

  if (!aiConfig) {
    return { generatedAt: Date.now(), decisions };
  }

  const enriched = await Promise.all(decisions.map((decision, index) => enrichDecision(decision, contexts[index], aiConfig)));
  return { generatedAt: Date.now(), decisions: enriched };
}

async function enrichDecision(
  decision: AgentSignalDecision,
  context: unknown,
  aiConfig: AiConfig
): Promise<AgentSignalDecision> {
  try {
    const content = await sendChatCompletion(
      aiConfig,
      [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({ context, deterministicDecision: decision }, null, 2),
        },
      ],
      { temperature: 0.2, maxTokens: 260 }
    );

    const summary = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    if (!summary) return decision;
    return { ...decision, summary: summary.slice(0, 500) };
  } catch (err) {
    if (err instanceof AiClientError) {
      console.warn('[agent] AI enrichment failed:', err.message);
    } else {
      console.warn('[agent] AI enrichment failed with unknown error');
    }
    return decision;
  }
}

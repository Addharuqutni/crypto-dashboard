#!/usr/bin/env tsx

import { ScreenerStore } from '@/lib/application/screener/store';
import { readAiConfigFromEnv } from '@/lib/application/agent/ai-config';
import { runAgentOnLatest } from '@/lib/application/agent/agent-runner';

async function main(): Promise<void> {
  const store = new ScreenerStore();
  const latest = await store.readLatest();
  if (!latest) {
    console.error('[agent] no screener latest data found. Run `npm run screener -- --once` first.');
    process.exitCode = 1;
    return;
  }

  const aiConfig = readAiConfigFromEnv();
  const result = await runAgentOnLatest(latest, aiConfig, { topN: Number(process.env.AGENT_TOP_N ?? 5) });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('[agent] fatal:', err);
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * AI Signal Agent CLI entrypoint.
 *
 * Reads the latest screener snapshot and produces read-only decision-support
 * summaries. Does not place trades or recompute deterministic engine signals.
 *
 * Usage:
 *   npm run agent
 *   npm run agent -- --topN=8
 *
 * Optional AI enrichment (fail-soft):
 *   AI_BASE_URL, AI_API_KEY, AI_MODEL
 */

import { ScreenerStore } from '@/lib/application/screener/store';
import { readAiConfigFromEnv } from '@/lib/application/signal-agent/ai-config';
import { runAgentOnLatest } from '@/lib/application/signal-agent/agent-runner';

interface CliArgs {
  help: boolean;
  topN: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    help: false,
    topN: Number(process.env.AGENT_TOP_N ?? 5),
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg.startsWith('--topN=')) {
      const value = Number(arg.slice('--topN='.length));
      if (Number.isFinite(value) && value > 0) args.topN = Math.floor(value);
    }
  }

  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`crypto-dashboard agent

Usage:
  npm run agent
  npm run agent -- --topN=8

Environment:
  AGENT_TOP_N     # default topN when --topN is omitted (default 5)
  AI_BASE_URL     # optional OpenAI-compatible base URL
  AI_API_KEY      # optional provider key
  AI_MODEL        # optional model id
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const store = new ScreenerStore();
  const latest = await store.readLatest();
  if (!latest) {
    // eslint-disable-next-line no-console
    console.error('[agent] no screener latest data found. Run `npm run screener -- --once` first.');
    process.exitCode = 1;
    return;
  }

  const aiConfig = readAiConfigFromEnv();
  const result = await runAgentOnLatest(latest, aiConfig, { topN: args.topN });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[agent] fatal:', err);
  process.exitCode = 1;
});

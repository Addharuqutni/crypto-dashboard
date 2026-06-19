'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bot, RefreshCw, ShieldAlert } from 'lucide-react';
import type { AgentRunResult } from '@/lib/application/agent/agent-types';
import { formatDateTime } from '@/lib/shared/formatting';

type AgentApiResponse = {
  ok: boolean;
  error?: string;
  source?: {
    screenerCompletedAt: number;
    universeSize: number;
    timeframes: { setup: string; trigger: string; macro: string };
    aiEnabled: boolean;
  };
  result?: AgentRunResult;
};

export function AgentClient() {
  const [data, setData] = useState<AgentApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgent = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/agent?topN=8', { cache: 'no-store' });
      const payload = (await response.json()) as AgentApiResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Failed to load agent output.');
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent output.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgent();
  }, [loadAgent]);

  const decisions = data?.result?.decisions ?? [];

  return (
    <div className="space-y-6 animate-slide-up">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-surface-soft px-3 py-1 text-xs font-medium text-accent-primary">
            <Bot className="h-3.5 w-3.5" />
            Read-only AI Signal Agent
          </div>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-text-primary lg:text-3xl">
            AI Agent Watchlist
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Ringkasan keputusan dari snapshot screener terbaru. Agent tidak mengeksekusi trade dan tidak mengubah keputusan engine.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAgent()}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={isLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard label="AI enrichment" value={data?.source?.aiEnabled ? 'Enabled' : 'Deterministic only'} />
        <InfoCard label="Universe" value={data?.source ? `${data.source.universeSize} symbols` : '-'} />
        <InfoCard label="Last screener run" value={data?.source ? formatDateTime(data.source.screenerCompletedAt) : '-'} />
      </section>

      {error && (
        <div className="card flex items-start gap-3 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Agent belum siap</h3>
            <p className="mt-1 text-sm text-text-secondary">{error}</p>
          </div>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {isLoading && decisions.length === 0
          ? Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)
          : decisions.map((decision) => (
              <article key={decision.symbol} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">{decision.symbol}</h2>
                    <p className="text-xs text-text-muted">{decision.timeframe} · Engine {decision.engineAction}</p>
                  </div>
                  <span className="rounded-full border border-border-subtle bg-bg-surface-soft px-3 py-1 text-xs font-semibold text-text-primary">
                    {decision.decision}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-text-secondary">{decision.summary}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Confidence" value={`${decision.confidence}%`} />
                  <MiniStat label="Risk" value={decision.riskLevel} />
                  <MiniStat label="Generated" value={new Date(decision.generatedAt).toLocaleTimeString()} />
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <ListBlock title="Reasons" items={decision.reasons} />
                  <ListBlock title="Invalidations" items={decision.invalidations} />
                </div>

                <div className="mt-4 rounded-xl border border-border-subtle bg-bg-surface-soft p-3 text-xs text-text-secondary">
                  <div><span className="text-text-primary">Entry:</span> {decision.plan.entryTrigger}</div>
                  <div><span className="text-text-primary">Stop:</span> {decision.plan.stopLoss}</div>
                  <div><span className="text-text-primary">TP:</span> {decision.plan.takeProfit}</div>
                </div>
              </article>
            ))}
      </section>

      <footer className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-surface-soft p-4 text-xs text-text-muted">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>
          Edukasi dan decision-support saja. Bukan financial advice, bukan sinyal pasti, dan bukan jaminan profit. WAIT adalah keputusan valid.
        </p>
      </footer>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft p-3">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-text-secondary">
        {items.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function SkeletonCard() {
  return <div className="card h-72 animate-pulse bg-bg-surface-soft" />;
}

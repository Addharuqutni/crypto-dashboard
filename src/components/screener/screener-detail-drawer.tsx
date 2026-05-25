'use client';

import { useState } from 'react';
import { X, TrendingUp, TrendingDown, Pause, ShieldCheck, AlertTriangle, Database, BookmarkPlus, Check } from 'lucide-react';
import type { RankedScreenerResult, ScreenerAiAuditSummary } from '@/lib/application/screener/types';
import { mapScreenerToJournal, describeJournalBlock } from '@/lib/application/screener/to-journal';
import { useSignalJournalStore } from '@/stores/use-signal-journal-store';
import { PositionSizeCard } from '@/components/risk/position-size-card';
import { cn } from '@/lib/shared/utils';

interface ScreenerDetailDrawerProps {
  result: RankedScreenerResult | null;
  audit?: ScreenerAiAuditSummary;
  onClose: () => void;
}

/**
 * Detail drawer for a single screener row. It exposes deterministic engine
 * output, local alert/rank reasons, and data-health context without
 * recomputing signals in the browser.
 */
export function ScreenerDetailDrawer({ result, audit, onClose }: ScreenerDetailDrawerProps) {
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'blocked'>('idle');
  const [blockReasons, setBlockReasons] = useState<string[]>([]);
  const addToJournal = useSignalJournalStore((s) => s.add);

  if (!result) return null;

  const handleSaveToJournal = () => {
    if (!result) return;
    const { payload, blocks } = mapScreenerToJournal(result);
    if (!payload || blocks.length > 0) {
      setBlockReasons(blocks.map(describeJournalBlock));
      setSaveState('blocked');
      setTimeout(() => setSaveState('idle'), 4000);
      return;
    }
    const added = addToJournal(payload);
    if (added) {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  };

  const ActionIcon =
    result.action === 'LONG' ? TrendingUp :
    result.action === 'SHORT' ? TrendingDown : Pause;

  const actionTone =
    result.action === 'LONG' ? 'text-market-up bg-market-up/10 border-market-up/20' :
    result.action === 'SHORT' ? 'text-market-down bg-market-down/10 border-market-down/20' :
    'text-market-neutral bg-market-neutral/10 border-market-neutral/20';

  return (
    <div className="fixed inset-0 z-overlay flex justify-end bg-black/45 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="screener-detail-title">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close details" />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-border-subtle bg-bg-surface shadow-2xl animate-slide-up sm:rounded-l-2xl">
        {/* Header */}
        <div className="border-b border-border-subtle bg-bg-surface-soft/70 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted">Setup classification</p>
              <h2 id="screener-detail-title" className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-text-primary">
                {result.baseAsset}<span className="text-text-muted">/{result.quoteAsset}</span>
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-primary"
              aria-label="Close setup details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-sm font-bold', actionTone)}>
              <ActionIcon className="h-4 w-4" />
              {result.action}
            </span>
            <MetricPill label="Confidence" value={`${result.confidence}%`} />
            <MetricPill label="Grade" value={result.grade} />
            <MetricPill label="Rank" value={result.rank > 0 ? `#${result.rank}` : 'Unranked'} />
            <MetricPill label="Score" value={result.rankingScore.toFixed(1)} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4">
            <Section title="Engine levels" icon={<ShieldCheck className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Level label="Entry" value={result.entry} />
                <Level label="Stop loss" value={result.stopLoss} tone="danger" />
                {result.takeProfits.map((tp, idx) => (
                  <Level key={idx} label={`Take profit ${idx + 1}`} value={tp} tone="success" />
                ))}
                <Info label="Risk reward" value={result.riskReward != null ? result.riskReward.toFixed(2) : 'Not available'} />
              </div>
              <p className="mt-3 rounded-lg bg-bg-surface-soft p-3 text-xs text-text-secondary">
                Engine entry/SL/TP are deterministic outputs. AI-proposed levels are not currently persisted for this setup.
              </p>
            </Section>

            <Section title="AI Audit" icon={<AlertTriangle className="h-4 w-4" />}>
              {!audit ? (
                <div className="rounded-lg border border-border-subtle bg-bg-surface-soft p-3 text-sm text-text-secondary">
                  AI audit unavailable. Screener remains fully deterministic without AI.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border-subtle bg-bg-surface-soft p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-accent-primary/30 bg-accent-primary/10 px-2 py-0.5 text-xs font-semibold text-accent-primary">
                        AI Audit: {audit.verdict}
                      </span>
                      <span className="text-xs text-text-muted">
                        Confidence means setup quality, not win probability.
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-text-primary">{audit.summary}</p>
                    <p className="mt-1 text-xs text-text-secondary">Main risk: {audit.mainRisk}</p>
                    <p className="mt-1 text-xs text-text-secondary">Next step: {audit.nextStep}</p>
                    {audit.caveats.length > 0 && (
                      <details className="mt-2 text-xs text-text-secondary">
                        <summary className="cursor-pointer text-text-muted">Caveats</summary>
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {audit.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>

                  <div className="rounded-lg border border-border-subtle bg-bg-surface-soft p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">AI proposed levels</p>
                    {audit.aiLevelValidationStatus === 'VALIDATED' && audit.proposedLevels ? (
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <Level label="AI entry" value={audit.proposedLevels.entry} />
                        <Level label="AI stop loss" value={audit.proposedLevels.stopLoss} tone="danger" />
                        {audit.proposedLevels.takeProfits.map((tp, idx) => (
                          <Level key={idx} label={`AI take profit ${idx + 1}`} value={tp} tone="success" />
                        ))}
                      </div>
                    ) : audit.aiLevelValidationStatus === 'REJECTED' ? (
                      <div className="mt-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
                        <p className="font-semibold">AI levels rejected</p>
                        <ul className="mt-1 list-disc pl-5 text-xs">
                          {audit.aiLevelValidationReasons.map((reason) => <li key={reason}>{formatLabel(reason)}</li>)}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-text-secondary">No AI-proposed levels provided.</p>
                    )}
                    {audit.proposedLevels?.basis?.length ? (
                      <List label="AI level basis" items={audit.proposedLevels.basis} empty="No basis." />
                    ) : null}
                  </div>
                </div>
              )}
            </Section>

            <PositionSizeCard
              side={result.action}
              entry={result.entry}
              stopLoss={result.stopLoss}
            />

            <Section title="Risk state" icon={<ShieldCheck className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Market regime" value={formatLabel(result.marketRegime)} />
                <Info label="Trade permission" value={formatLabel(result.tradePermission)} />
                <Info label="Funding rate" value={result.fundingRate != null ? `${(result.fundingRate * 100).toFixed(4)}%` : 'Unavailable'} />
                <Info label="Open interest Δ" value={result.openInterestChangePercent != null ? `${result.openInterestChangePercent.toFixed(2)}%` : 'Unavailable'} />
              </div>
            </Section>

            <Section title="Engine reasons" icon={<Database className="h-4 w-4" />}>
              <List label="Reasons" items={result.reasons} empty="No positive engine reasons provided." />
              <List label="No-trade reason" items={result.noTradeReasons} empty="No no-trade reasons for this setup." />
              <List label="Warnings" items={result.warnings} empty="No warnings." tone="warning" />
              <List label="Rank reason" items={result.rankReason} empty="No rank reasons." />
              <List label="Alert block reasons" items={result.alertBlockReasons} empty="No alert block reasons." tone="warning" />
            </Section>

            <Section title="Data health & freshness" icon={<Database className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Overall" value={result.dataHealth.ok ? 'Healthy' : 'Degraded'} tone={result.dataHealth.ok ? 'success' : 'warning'} />
                <Info label="Confidence cap" value={`${result.dataHealth.confidenceCap}%`} />
                <Info label="Setup candle age" value={formatAge(result.freshness.setupCandleAgeSec)} />
                <Info label="Macro candle age" value={formatAge(result.freshness.macroCandleAgeSec)} />
                <Info label="Trigger candle age" value={formatAge(result.freshness.triggerCandleAgeSec)} />
                <Info label="Funding freshness" value={formatAge(result.freshness.fundingAgeSec)} />
                <Info label="OI freshness" value={formatAge(result.freshness.openInterestAgeSec)} />
              </div>
              <List label="Data health reasons" items={result.dataHealth.reasons} empty="Data health gate has no reasons." />
            </Section>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border-subtle bg-bg-surface-soft/70 px-5 py-3">
          <button
            onClick={handleSaveToJournal}
            disabled={saveState === 'saved'}
            className={cn(
              'pressable inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              saveState === 'saved'
                ? 'border-success/40 bg-success/10 text-success cursor-default'
                : saveState === 'blocked'
                  ? 'border-warning/40 bg-warning/10 text-warning'
                  : 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20'
            )}
            aria-label="Save this setup to signal journal"
          >
            {saveState === 'saved' ? (
              <><Check className="h-4 w-4" /> Saved to Journal</>
            ) : saveState === 'blocked' ? (
              <><AlertTriangle className="h-4 w-4" /> Cannot Save</>
            ) : (
              <><BookmarkPlus className="h-4 w-4" /> Save to Journal</>
            )}
          </button>
          {saveState === 'blocked' && blockReasons.length > 0 && (
            <ul className="text-xs text-warning">
              {blockReasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          <span className="ml-auto text-xs text-text-muted">
            Educational decision-support only, not financial advice.
          </span>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/70 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <span className="text-accent-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-bg-surface-raised px-2.5 py-1 text-xs text-text-secondary">
      {label}: <strong className="text-text-primary">{value}</strong>
    </span>
  );
}

function Level({ label, value, tone }: { label: string; value: number | null; tone?: 'success' | 'danger' }) {
  return <Info label={label} value={value != null ? formatPrice(value) : 'Not available'} tone={tone} />;
}

function Info({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="rounded-lg bg-bg-surface-soft p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={cn('mt-1 text-sm font-semibold tabular-nums', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger', !tone && 'text-text-primary')}>
        {value}
      </div>
    </div>
  );
}

function List({ label, items, empty, tone }: { label: string; items: string[]; empty: string; tone?: 'warning' }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, idx) => (
            <li key={`${item}-${idx}`} className={cn('flex gap-2 text-sm text-text-secondary', tone === 'warning' && 'text-warning')}>
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-70" />
              <span>{formatLabel(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Format a price with appropriate precision for crypto pairs. */
function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

/** Convert snake_case technical labels into readable risk-first UI copy. */
function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format age seconds into concise freshness copy. */
function formatAge(ageSec: number | null): string {
  if (ageSec == null) return 'Unavailable';
  if (ageSec < 60) return `${ageSec}s ago`;
  const mins = Math.round(ageSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

'use client';

import { Activity, Layers, Shield, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketContext } from '@/types/intelligence';

/**
 * Market Regime Dashboard.
 *
 * Renders the deterministic `MarketContext` snapshot. Static labels — there
 * is no AI in this component. The AI Auditor panel renders separately.
 */
export interface MarketRegimePanelProps {
  context: MarketContext | null;
  loading?: boolean;
}

export function MarketRegimePanel({ context, loading = false }: MarketRegimePanelProps) {
  return (
    <section className="card space-y-4 px-4 py-4" aria-labelledby="market-regime-title">
      <header className="flex items-center justify-between">
        <h2
          id="market-regime-title"
          className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
        >
          <Layers className="h-3.5 w-3.5" />
          Market Regime
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {context ? `BTC anchor · updated ${formatTime(context.generatedAt)}` : 'no data'}
        </span>
      </header>

      {!context && !loading && (
        <p className="text-xs text-text-muted">
          Market context unavailable. Open the dashboard or wait for the next worker cycle.
        </p>
      )}

      {loading && !context && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-bg-surface-raised" />
          ))}
        </div>
      )}

      {context && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Cell
              label="Regime (4H)"
              value={labelize(context.btc4hRegime)}
              tone={regimeTone(context.btc4hRegime)}
            />
            <Cell
              label="Permission"
              value={labelize(context.tradePermission)}
              tone={permissionTone(context.tradePermission)}
            />
            <Cell
              label="Volatility"
              value={labelize(context.volatility.regime)}
              tone={volatilityTone(context.volatility.regime)}
              hint={
                context.volatility.atrToPrice != null
                  ? `${(context.volatility.atrToPrice * 100).toFixed(2)}% ATR`
                  : undefined
              }
            />
            <Cell
              label="Funding"
              value={labelize(context.funding.regime)}
              tone={fundingTone(context.funding.regime)}
              hint={
                context.funding.rate != null
                  ? `${(context.funding.rate * 100).toFixed(4)}%`
                  : undefined
              }
            />
            <Cell
              label="Open Interest"
              value={labelize(context.openInterest.regime)}
              tone={oiTone(context.openInterest.regime)}
              hint={
                context.openInterest.change24hPct != null
                  ? `${context.openInterest.change24hPct >= 0 ? '+' : ''}${context.openInterest.change24hPct.toFixed(1)}% / 24h`
                  : undefined
              }
            />
            <Cell
              label="Risk Mode"
              value={labelize(context.riskMode)}
              tone={riskModeTone(context.riskMode)}
              icon={<Shield className="h-3 w-3" />}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SubCell
              label="Trigger Bias"
              value={context.triggerBias}
              icon={biasIcon(context.triggerBias)}
            />
            <SubCell
              label="ETH ↔ BTC Correlation"
              value={labelize(context.ethCorrelation)}
              icon={<Activity className="h-3 w-3" />}
            />
          </div>

          {context.reasons.length > 0 && (
            <div className="space-y-1 rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Reasons
              </p>
              <ul className="space-y-1 text-[11px] text-text-secondary">
                {context.reasons.slice(0, 5).map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {context.warnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5">
              {context.warnings.slice(0, 4).map((w) => (
                <div key={w} className="flex items-start gap-2 text-[11px] text-yellow-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

type Tone = 'bullish' | 'bearish' | 'caution' | 'neutral';

function Cell({
  label,
  value,
  tone = 'neutral',
  hint,
  icon,
}: {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface-soft px-2 py-1.5">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-sm font-semibold',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          tone === 'caution' && 'text-yellow-400',
          tone === 'neutral' && 'text-text-primary'
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-text-muted">{hint}</p>}
    </div>
  );
}

function SubCell({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-surface-soft px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {icon}
        {label}
      </div>
      <span className="text-xs font-semibold text-text-primary">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tone helpers
// ---------------------------------------------------------------------------

function labelize(s: string): string {
  return s.replace(/_/g, ' ');
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function regimeTone(r: MarketContext['btc4hRegime']): Tone {
  if (r === 'bullish_trend') return 'bullish';
  if (r === 'bearish_trend') return 'bearish';
  if (r === 'choppy' || r === 'volatile') return 'caution';
  return 'neutral';
}

function permissionTone(p: MarketContext['tradePermission']): Tone {
  if (p === 'long_only') return 'bullish';
  if (p === 'short_only') return 'bearish';
  if (p === 'no_trade') return 'caution';
  return 'neutral';
}

function volatilityTone(v: MarketContext['volatility']['regime']): Tone {
  if (v === 'extreme') return 'caution';
  if (v === 'high') return 'caution';
  return 'neutral';
}

function fundingTone(f: MarketContext['funding']['regime']): Tone {
  if (f === 'crowded_long' || f === 'crowded_short') return 'caution';
  return 'neutral';
}

function oiTone(o: MarketContext['openInterest']['regime']): Tone {
  if (o === 'abnormal') return 'caution';
  return 'neutral';
}

function riskModeTone(m: MarketContext['riskMode']): Tone {
  if (m === 'no_trade') return 'caution';
  if (m === 'caution') return 'caution';
  return 'neutral';
}

function biasIcon(b: MarketContext['triggerBias']) {
  if (b === 'bullish') return <TrendingUp className="h-3 w-3" />;
  if (b === 'bearish') return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

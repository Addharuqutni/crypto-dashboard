'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  Play,
  TrendingDown,
  TrendingUp,
  History,
} from 'lucide-react';
import {
  runBacktest,
  projectEquityCurve,
  type BacktestMetrics,
  type BacktestResult,
  type BacktestTrade,
  type EquityPoint,
} from '@/lib/application/backtest';
import { fetchHistoricalKlines, KlineFetchError } from '@/lib/adapters/api/binance-kline';
import type { ChartTimeframe } from '@/types/chart';
import { COIN_REGISTRY, getDefaultCoins } from '@/lib/shared/registry/coin-registry';
import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';

/**
 * Historical backtest panel.
 *
 * Lets the operator point the live signal engine at real Binance USDⓈ-M
 * Futures klines and inspect the resulting performance.
 *
 * Why this is separate from `BacktestPanel`:
 *   - The fixture panel proves the engine respects regimes deterministically.
 *   - This panel proves it survives real market microstructure.
 *
 * The panel is intentionally read-only with respect to engine config: the
 * surface area we expose (cost knobs, max-hold, conflict resolution, warmup)
 * is the simulator's contract — engine internals are not tunable here so
 * results stay comparable across runs.
 */

const TIMEFRAMES: ChartTimeframe[] = ['15m', '30m', '1H', '4H'];
const BAR_LIMITS = [300, 500, 1000, 2000, 3000, 5000] as const;
/**
 * Engine warmup: EMA200 needs 200 closed bars; we leave a small buffer for
 * other indicators that warm a few extra candles. Mirrors `runBacktest`'s
 * default of 220 in src/lib/backtest/runner.ts so the panel can pre-validate.
 */
const ENGINE_WARMUP_BARS = 220;
/** Minimum useful sample after warmup so the run is not just noise. */
const MIN_SAMPLE_AFTER_WARMUP = 50;

const DEFAULT_SYMBOLS = getDefaultCoins().slice(0, 30).map((c) => c.symbol);

interface RunState {
  status: 'idle' | 'running' | 'success' | 'error';
  result?: BacktestResult;
  error?: string;
  meta?: {
    symbol: string;
    timeframe: ChartTimeframe;
    requestedBars: number;
    candleCount: number;
    startTime: number;
    endTime: number;
    truncated: boolean;
  };
}

export function HistoricalBacktestPanel() {
  const [symbol, setSymbol] = useState<string>('BTC');
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('30m');
  const [bars, setBars] = useState<number>(500);
  const [maxHold, setMaxHold] = useState<number>(48);
  const [takerFeeBps, setTakerFeeBps] = useState<number>(4); // 0.04%
  const [slippageBps, setSlippageBps] = useState<number>(5); // 0.05%
  const [preferStop, setPreferStop] = useState<boolean>(true);
  const [run, setRun] = useState<RunState>({ status: 'idle' });

  const handleRun = async () => {
    // Up-front guard: if the requested window cannot satisfy the engine
    // warmup we tell the user before spending a network round-trip.
    if (bars < ENGINE_WARMUP_BARS + MIN_SAMPLE_AFTER_WARMUP) {
      setRun({
        status: 'error',
        error: `Need at least ${ENGINE_WARMUP_BARS + MIN_SAMPLE_AFTER_WARMUP} bars (${ENGINE_WARMUP_BARS} for engine warmup + ${MIN_SAMPLE_AFTER_WARMUP} for a meaningful sample). Pick a deeper window.`,
      });
      return;
    }

    setRun({ status: 'running' });
    try {
      // Real klines, real microstructure. fetchHistoricalKlines paginates
      // beyond Binance's per-request 1500-cap so the requested bar count is
      // actually delivered (subject to symbol history availability).
      const candles = await fetchHistoricalKlines(symbol, timeframe, bars);

      if (candles.length < ENGINE_WARMUP_BARS + MIN_SAMPLE_AFTER_WARMUP) {
        setRun({
          status: 'error',
          error: `Binance returned only ${candles.length} candles for ${symbol}/${timeframe}; need at least ${ENGINE_WARMUP_BARS + MIN_SAMPLE_AFTER_WARMUP}. The symbol may not have enough history.`,
        });
        return;
      }

      const result = runBacktest({
        symbol,
        timeframe,
        candles,
        backtestConfig: {
          maxHoldCandles: maxHold,
          preferStopOnConflict: preferStop,
          costs: {
            takerFee: takerFeeBps / 10_000,
            slippage: slippageBps / 10_000,
            fundingCost: 0,
            fundingIntervalCandles: 16,
          },
        },
      });

      setRun({
        status: 'success',
        result,
        meta: {
          symbol,
          timeframe,
          requestedBars: bars,
          candleCount: candles.length,
          startTime: candles[0]?.openTime ?? 0,
          endTime: candles[candles.length - 1]?.closeTime ?? 0,
          truncated: candles.length < bars,
        },
      });
    } catch (err) {
      const msg =
        err instanceof KlineFetchError
          ? `Binance fetch failed: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown error during backtest run';
      setRun({ status: 'error', error: msg });
    }
  };

  return (
    <section
      className="card space-y-4 px-4 py-4"
      aria-labelledby="historical-backtest-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="historical-backtest-title"
          className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wider text-text-muted"
        >
          <History className="h-3.5 w-3.5" />
          Historical Backtest
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          Binance USDⓈ-M Futures · live klines
        </span>
      </header>

      <p className="text-xs text-text-muted">
        Replay the live signal engine over real Binance klines. Costs, max-hold, and
        conflict-resolution are tunable below. Engine internals (thresholds, gates) stay fixed
        across runs so results are comparable.
      </p>

      {/* Controls */}
      <div className="grid gap-3 rounded-lg border border-border-subtle bg-bg-surface-soft p-3 sm:grid-cols-2 lg:grid-cols-4">
        <ControlSelect
          label="Symbol"
          value={symbol}
          onChange={setSymbol}
          options={DEFAULT_SYMBOLS.map((s) => ({
            value: s,
            label: `${s} · ${COIN_REGISTRY.find((c) => c.symbol === s)?.name ?? s}`,
          }))}
        />
        <ControlSelect
          label="Timeframe"
          value={timeframe}
          onChange={(v) => setTimeframe(v as ChartTimeframe)}
          options={TIMEFRAMES.map((t) => ({ value: t, label: t }))}
        />
        <ControlSelect
          label="Candles"
          value={String(bars)}
          onChange={(v) => setBars(Number(v))}
          options={BAR_LIMITS.map((n) => ({ value: String(n), label: `${n} bars` }))}
        />
        <ControlNumber
          label="Max Hold (bars)"
          value={maxHold}
          min={4}
          max={500}
          onChange={setMaxHold}
        />
        <ControlNumber
          label="Taker Fee (bps)"
          value={takerFeeBps}
          min={0}
          max={50}
          step={1}
          onChange={setTakerFeeBps}
          hint="1 bp = 0.01%"
        />
        <ControlNumber
          label="Slippage (bps)"
          value={slippageBps}
          min={0}
          max={100}
          step={1}
          onChange={setSlippageBps}
          hint="Per-side"
        />
        <label className="flex items-center gap-2 self-end pb-1 text-[11px] text-text-secondary">
          <input
            type="checkbox"
            checked={preferStop}
            onChange={(e) => setPreferStop(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent-primary"
          />
          <span>Prefer SL on same-bar conflict</span>
        </label>
        <button
          onClick={handleRun}
          disabled={run.status === 'running'}
          className={cn(
            'pressable flex h-9 items-center justify-center gap-2 self-end rounded-md border border-accent-primary/40 bg-accent-primary/10 px-3 text-xs font-semibold text-accent-primary transition-colors',
            'hover:bg-accent-primary/15 disabled:opacity-60 disabled:hover:bg-accent-primary/10',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
          )}
        >
          {run.status === 'running' ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Run Backtest
            </>
          )}
        </button>
      </div>

      {/* States */}
      {run.status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-market-down/30 bg-market-down/5 px-3 py-2.5 text-[11px] text-market-down">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{run.error}</span>
        </div>
      )}

      {run.status === 'idle' && (
        <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-6 text-center">
          <p className="text-sm font-medium text-text-secondary">No run yet.</p>
          <p className="mt-1 text-xs text-text-muted">
            Pick a symbol, timeframe, and depth, then click <em>Run Backtest</em>. Engine respects
            warmup automatically — pick more bars for tighter samples.
          </p>
        </div>
      )}

      {run.status === 'running' && (
        <div className="space-y-2">
          <div className="skeleton h-20 w-full" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        </div>
      )}

      {run.status === 'success' && run.result && run.meta && (
        <ResultView result={run.result} meta={run.meta} />
      )}
    </section>
  );
}

// ----- Sub-components -----

function ResultView({
  result,
  meta,
}: {
  result: BacktestResult;
  meta: NonNullable<RunState['meta']>;
}) {
  const m = result.metrics;
  const equity = useMemo(() => projectEquityCurve(result.trades), [result.trades]);

  return (
    <div className="space-y-4">
      {/* Run summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-surface-soft px-3 py-2 text-[11px] text-text-secondary">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Tag label={`${meta.symbol}`} tone="primary" />
          <Tag label={meta.timeframe} />
          <Tag
            label={
              meta.truncated
                ? `${meta.candleCount} / ${meta.requestedBars} bars`
                : `${meta.candleCount} bars`
            }
          />
          {meta.truncated && (
            <span className="text-[10px] text-yellow-300">
              Symbol history shorter than requested window
            </span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {formatRange(meta.startTime, meta.endTime)}
        </span>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Signals" value={m.totalSignals.toString()} />
        <Metric label="Trades" value={m.totalTrades.toString()} />
        <Metric label="Wait Rate" value={`${m.waitRate.toFixed(0)}%`} />
        <Metric
          label="Win Rate"
          value={`${m.winRate.toFixed(1)}%`}
          tone={m.winRate >= 50 ? 'bullish' : 'bearish'}
        />
        <Metric
          label="Expectancy"
          value={`${formatR(m.expectancyR)}R`}
          tone={m.expectancyR > 0 ? 'bullish' : 'bearish'}
        />
        <Metric label="Max DD" value={`${m.maxDrawdownR.toFixed(2)}R`} tone="bearish" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Avg R" value={`${formatR(m.averageR)}R`} />
        <Metric
          label="Profit Factor"
          value={Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : '\u221e'}
          tone={
            Number.isFinite(m.profitFactor)
              ? m.profitFactor >= 1
                ? 'bullish'
                : 'bearish'
              : 'bullish'
          }
        />
        <Metric label="Loss Streak" value={m.maxLosingStreak.toString()} />
        <Metric label="Avg Hold" value={`${m.averageHoldCandles.toFixed(0)} bars`} />
      </div>

      {/* Equity curve */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Equity Curve (cumulative R)
        </h3>
        <EquityCurveChart points={equity} />
      </div>

      {/* Best / Worst */}
      <div className="grid gap-2 sm:grid-cols-2">
        <SetupCard label="Best Setup" setup={m.bestSetupType} tone="bullish" />
        <SetupCard label="Worst Setup" setup={m.worstSetupType} tone="bearish" />
      </div>

      {/* Trade ledger */}
      {result.trades.length > 0 && (
        <details className="group rounded-lg border border-border-subtle bg-bg-surface-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            <span>Trade Ledger ({result.trades.length})</span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <TradeLedger trades={result.trades} />
        </details>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5">
          {result.warnings.map((warning) => (
            <div key={warning} className="flex items-start gap-2 text-[11px] text-yellow-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EquityCurveChart({ points }: { points: EquityPoint[] }) {
  // Simple inline SVG so we don't pull in a chart library for a single series.
  // Lightweight Charts is overkill here and would force a wrapper for a static
  // path. The viewBox is square-ish; the path scales naturally on resize.
  if (points.length <= 1) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-6 text-center text-[11px] text-text-muted">
        No closed trades to plot.
      </div>
    );
  }

  const width = 800;
  const height = 180;
  const padding = 16;

  const maxY = Math.max(...points.map((p) => p.cumulativeR), 0.5);
  const minY = Math.min(...points.map((p) => p.cumulativeR), -0.5);
  const yRange = Math.max(maxY - minY, 0.5);
  const xStep = (width - padding * 2) / Math.max(points.length - 1, 1);

  const toX = (i: number) => padding + i * xStep;
  const toY = (v: number) => {
    const norm = (v - minY) / yRange;
    return height - padding - norm * (height - padding * 2);
  };

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(2)} ${toY(p.cumulativeR).toFixed(2)}`)
    .join(' ');

  // Area under the curve so positive/negative regions are easy to spot.
  const zeroY = toY(0);
  const lastX = toX(points.length - 1);
  const area = `${path} L ${lastX.toFixed(2)} ${zeroY.toFixed(2)} L ${padding} ${zeroY.toFixed(2)} Z`;

  const lastPoint = points[points.length - 1]!;
  const isPositive = lastPoint.cumulativeR >= 0;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-bg-surface-soft p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-44 w-full"
        role="img"
        aria-label="Cumulative R equity curve"
      >
        <defs>
          <linearGradient id="equity-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={isPositive ? '#22c55e' : '#ef4444'}
              stopOpacity="0.35"
            />
            <stop offset="100%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Zero line */}
        <line
          x1={padding}
          x2={width - padding}
          y1={zeroY}
          y2={zeroY}
          stroke="#1f2937"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <path d={area} fill="url(#equity-gradient)" />
        <path
          d={path}
          fill="none"
          stroke={isPositive ? '#22c55e' : '#ef4444'}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-text-muted">
        <span>0R baseline</span>
        <span className={cn('numeric', isPositive ? 'text-market-up' : 'text-market-down')}>
          End: {formatR(lastPoint.cumulativeR)}R
        </span>
      </div>
    </div>
  );
}

function TradeLedger({ trades }: { trades: BacktestTrade[] }) {
  return (
    <div className="max-h-72 overflow-auto border-t border-border-subtle">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-bg-surface-raised text-[10px] uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">#</th>
            <th className="px-2 py-1.5 text-left font-medium">Side</th>
            <th className="px-2 py-1.5 text-left font-medium">Setup</th>
            <th className="px-2 py-1.5 text-right font-medium">Entry</th>
            <th className="px-2 py-1.5 text-right font-medium">Exit</th>
            <th className="px-2 py-1.5 text-right font-medium">Bars</th>
            <th className="px-2 py-1.5 text-right font-medium">R</th>
            <th className="px-2 py-1.5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={t.id} className="border-t border-border-subtle/60">
              <td className="px-2 py-1.5 text-text-muted">{i + 1}</td>
              <td className="px-2 py-1.5">
                <span
                  className={cn(
                    'rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase',
                    t.signal.action === 'LONG' && 'bg-market-up/10 text-market-up',
                    t.signal.action === 'SHORT' && 'bg-market-down/10 text-market-down'
                  )}
                >
                  {t.signal.action}
                </span>
              </td>
              <td className="px-2 py-1.5 text-text-secondary">
                {t.signal.setupType.replace(/_/g, ' ')}
              </td>
              <td className="numeric px-2 py-1.5 text-right text-text-primary">
                {formatCurrency(t.entryFill)}
              </td>
              <td className="numeric px-2 py-1.5 text-right text-text-secondary">
                {t.exitFill != null ? formatCurrency(t.exitFill) : '\u2014'}
              </td>
              <td className="numeric px-2 py-1.5 text-right text-text-muted">{t.heldBars}</td>
              <td
                className={cn(
                  'numeric px-2 py-1.5 text-right font-semibold',
                  t.finalR > 0 && 'text-market-up',
                  t.finalR < 0 && 'text-market-down',
                  t.finalR === 0 && 'text-text-muted'
                )}
              >
                {formatR(t.finalR)}
              </td>
              <td className="px-2 py-1.5">
                <StatusPill status={t.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: BacktestTrade['status'] }) {
  const map: Record<BacktestTrade['status'], { label: string; className: string }> = {
    PENDING: {
      label: 'Pending',
      className: 'border-accent-primary/30 bg-accent-primary/10 text-accent-primary',
    },
    TP1: { label: 'TP1', className: 'border-market-up/30 bg-market-up/5 text-market-up' },
    TP2: { label: 'TP2', className: 'border-market-up/40 bg-market-up/10 text-market-up' },
    TP3: { label: 'TP3', className: 'border-market-up/50 bg-market-up/15 text-market-up' },
    SL: { label: 'SL Hit', className: 'border-market-down/40 bg-market-down/10 text-market-down' },
    EXPIRED: {
      label: 'Expired',
      className: 'border-text-muted/30 bg-bg-surface-raised text-text-muted',
    },
  };
  const c = map[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        c.className
      )}
    >
      {c.label}
    </span>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'bullish' | 'bearish';
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface-soft px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          'numeric mt-0.5 text-sm font-semibold',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          !tone && 'text-text-primary'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SetupCard({
  label,
  setup,
  tone,
}: {
  label: string;
  setup: BacktestMetrics['bestSetupType'];
  tone: 'bullish' | 'bearish';
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {tone === 'bullish' ? (
          <TrendingUp className="h-3 w-3" />
        ) : (
          <TrendingDown className="h-3 w-3" />
        )}
        {label}
      </div>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down'
        )}
      >
        {setup ? setup.replace(/_/g, ' ') : '\u2014 (insufficient samples)'}
      </p>
    </div>
  );
}

function Tag({ label, tone }: { label: string; tone?: 'primary' }) {
  return (
    <span
      className={cn(
        'rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        tone === 'primary'
          ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary'
          : 'border-border-subtle bg-bg-surface-raised text-text-secondary'
      )}
    >
      {label}
    </span>
  );
}

function ControlSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-text-muted">
      <span className="font-medium uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border-subtle bg-bg-surface-raised px-2 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-bg-surface">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ControlNumber({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-text-muted">
      <span className="flex items-center justify-between font-medium uppercase tracking-wider">
        {label}
        {hint && <span className="text-[10px] normal-case text-text-muted/70">{hint}</span>}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        min={min}
        max={max}
        step={step}
        className="h-9 rounded-md border border-border-subtle bg-bg-surface-raised px-2 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      />
    </label>
  );
}

// ----- helpers -----

function formatR(v: number): string {
  if (!Number.isFinite(v)) return '\u221e';
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

function formatRange(start: number, end: number): string {
  if (!start || !end) return '';
  const fmt = (ms: number) =>
    new Intl.DateTimeFormat('en-US', {
      year: '2-digit',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms));
  return `${fmt(start)} → ${fmt(end)}`;
}

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';
import { AiTechnicalSummary } from '@/components/ai-agent/ai-technical-summary';
import type { Candle, AnalysisResult } from '@/types/chart';
import type { TechnicalContext } from '@/types/ai';
import type { FuturesSignal } from '@/types/futures-signal';
import type { RsiResult } from '@/lib/domain/indicators/rsi';
import type { MacdPoint } from '@/lib/domain/indicators/macd';
import type { SupportResistance } from '@/lib/domain/indicators/support-resistance';
import type { TrendLabel } from '@/lib/domain/indicators/trend-label';
import type { FibonacciResult } from '@/lib/domain/indicators/fibonacci';
import type { OrderBlock } from '@/lib/domain/indicators/order-block';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Info } from 'lucide-react';

interface TechnicalPanelProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  currentPrice?: number;
  activeIndicators: Set<string>;
  /** Pre-computed analysis from parent — avoids duplicate indicator calculation */
  analysis: AnalysisResult | null;
  /**
   * Deterministic engine output, hoisted from the page so the AI Summary
   * audits the same signal that drives the Futures Setup panel.
   */
  signal?: FuturesSignal | null;
}

/**
 * Technical Analysis panel — shows RSI, MACD, Volume, Support/Resistance,
 * Fibonacci, Order Blocks, Trend Label, and a summary.
 * Only renders when Technical Mode is active.
 * Receives pre-computed analysis from parent for performance.
 */
export function TechnicalPanel({ candles, symbol, timeframe, currentPrice, activeIndicators, analysis, signal }: TechnicalPanelProps) {
  // Build TechnicalContext for AI Summary
  const aiContext: TechnicalContext | null = useMemo(() => {
    if (!analysis) return null;
    return {
      symbol,
      timeframe,
      price: currentPrice,
      rsi: analysis.rsi.value != null ? { value: analysis.rsi.value, status: analysis.rsi.status } : undefined,
      macd: analysis.macd ? { macd: analysis.macd.macd, signal: analysis.macd.signal, histogram: analysis.macd.histogram } : undefined,
      trend: { value: analysis.trend.value, reasons: analysis.trend.reasons },
      supportResistance: { support: analysis.sr.support ?? null, resistance: analysis.sr.resistance ?? null, confidence: analysis.sr.confidence },
      fibonacci: analysis.fib ? { direction: analysis.fib.direction, levels: analysis.fib.levels.map((l) => ({ label: l.label, price: l.price })) } : undefined,
      orderBlocks: analysis.orderBlocks.slice(-3).map((ob) => ({ type: ob.type, high: ob.high, low: ob.low, strength: ob.strength })),
    };
  }, [analysis, symbol, timeframe, currentPrice]);
  if (!analysis) {
    return (
      <div className="card px-4 py-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-warning/60" />
        <p className="mt-2 text-sm font-medium text-text-secondary">Insufficient data</p>
        <p className="mt-1 text-xs text-text-muted">
          Not enough historical data to calculate technical indicators for this timeframe.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trend Label */}
      <TrendBadge trend={analysis.trend} symbol={symbol} />

      {/* Indicator Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* RSI */}
        {activeIndicators.has('RSI') && (
          <IndicatorCard title="RSI (14)">
            <RsiDisplay rsi={analysis.rsi} />
          </IndicatorCard>
        )}

        {/* MACD */}
        {activeIndicators.has('MACD') && analysis.macd && (
          <IndicatorCard title="MACD (12, 26, 9)">
            <MacdDisplay macd={analysis.macd} />
          </IndicatorCard>
        )}

        {/* Support / Resistance */}
        {activeIndicators.has('S/R') && (
          <IndicatorCard title="Support / Resistance">
            <SrDisplay sr={analysis.sr} />
          </IndicatorCard>
        )}

        {/* Volume */}
        {activeIndicators.has('Volume') && candles.length > 0 && (
          <IndicatorCard title="Volume (24h)">
            <VolumeDisplay candles={candles} />
          </IndicatorCard>
        )}

        {/* Fibonacci Retracement */}
        {activeIndicators.has('Fib') && analysis.fib && (
          <IndicatorCard title="Fibonacci Retracement">
            <FibonacciDisplay fib={analysis.fib} />
          </IndicatorCard>
        )}

        {/* Order Blocks */}
        {activeIndicators.has('OB') && analysis.orderBlocks.length > 0 && (
          <IndicatorCard title="Order Blocks">
            <OrderBlockDisplay blocks={analysis.orderBlocks} />
          </IndicatorCard>
        )}
      </div>

      {/* AI Technical Summary */}
      <AiTechnicalSummary context={aiContext} signal={signal ?? null} />

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-surface-soft px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
        <p className="text-xs leading-relaxed text-text-muted">
          This dashboard provides market data and technical indicators for informational purposes only.
          It is not financial advice. Always do your own research before making investment decisions.
        </p>
      </div>
    </div>
  );
}

// --- Sub-components ---

/**

 * Komponen TrendBadge untuk merender bagian UI terkait trend badge.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function TrendBadge({ trend, symbol }: { trend: TrendLabel; symbol: string }) {
  const colorMap = {
    bullish: 'border-market-up/30 bg-market-up/5 text-market-up',
    bearish: 'border-market-down/30 bg-market-down/5 text-market-down',
    sideways: 'border-accent-warm/30 bg-accent-warm/5 text-accent-warm',
    insufficient_data: 'border-border-subtle bg-bg-surface-soft text-text-muted',
  };

  const iconMap = {
    bullish: <TrendingUp className="h-5 w-5" />,
    bearish: <TrendingDown className="h-5 w-5" />,
    sideways: <Minus className="h-5 w-5" />,
    insufficient_data: <AlertTriangle className="h-5 w-5" />,
  };

  return (
    <div className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', colorMap[trend.value])}>
      {iconMap[trend.value]}
      <div>
        <p className="text-sm font-semibold capitalize">
          {symbol} — {trend.value === 'insufficient_data' ? 'Insufficient Data' : `${trend.value} Bias`}
        </p>
        {trend.reasons.length > 0 && (
          <p className="mt-0.5 text-xs opacity-80">{trend.reasons.join(' · ')}</p>
        )}
      </div>
    </div>
  );
}

/**

 * Komponen IndicatorCard untuk merender bagian UI terkait indicator card.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function IndicatorCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**

 * Komponen RsiDisplay untuk merender bagian UI terkait rsi display.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function RsiDisplay({ rsi }: { rsi: RsiResult }) {
  if (rsi.value == null) {
    return <p className="text-sm text-text-muted">Insufficient data</p>;
  }

  const statusColor = {
    overbought: 'text-market-down',
    oversold: 'text-market-up',
    neutral: 'text-text-primary',
    insufficient_data: 'text-text-muted',
  };

  return (
    <div>
      <p className={cn('numeric text-2xl font-bold', statusColor[rsi.status])}>
        {rsi.value.toFixed(1)}
      </p>
      <p className={cn('mt-1 text-xs font-medium capitalize', statusColor[rsi.status])}>
        {rsi.status.replace('_', ' ')}
      </p>
      {/* RSI gauge */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-surface-raised">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            rsi.value > 70 ? 'bg-market-down' : rsi.value < 30 ? 'bg-market-up' : 'bg-accent-primary'
          )}
          style={{ width: `${rsi.value}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-text-muted">
        <span>Oversold</span>
        <span>Overbought</span>
      </div>
    </div>
  );
}

/**

 * Komponen MacdDisplay untuk merender bagian UI terkait macd display.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function MacdDisplay({ macd }: { macd: MacdPoint }) {
  const isPositive = macd.histogram > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">MACD</span>
        <span className="numeric text-sm font-medium text-text-primary">{macd.macd.toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">Signal</span>
        <span className="numeric text-sm font-medium text-text-secondary">{macd.signal.toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">Histogram</span>
        <span className={cn('numeric text-sm font-bold', isPositive ? 'text-market-up' : 'text-market-down')}>
          {macd.histogram > 0 ? '+' : ''}{macd.histogram.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

/**

 * Komponen SrDisplay untuk merender bagian UI terkait sr display.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function SrDisplay({ sr }: { sr: SupportResistance }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-market-down">Resistance</span>
        <span className="numeric text-sm font-medium text-text-primary">
          {sr.resistance ? formatCurrency(sr.resistance) : '—'}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-market-up">Support</span>
        <span className="numeric text-sm font-medium text-text-primary">
          {sr.support ? formatCurrency(sr.support) : '—'}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">Confidence</span>
        <span className={cn(
          'text-xs font-medium capitalize',
          sr.confidence === 'high' && 'text-market-up',
          sr.confidence === 'medium' && 'text-accent-warm',
          sr.confidence === 'low' && 'text-text-muted'
        )}>
          {sr.confidence}
        </span>
      </div>
    </div>
  );
}

/**

 * Komponen VolumeDisplay untuk merender bagian UI terkait volume display.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function VolumeDisplay({ candles }: { candles: Candle[] }) {
  const recent = candles.slice(-24);
  const totalVolume = recent.reduce((sum, c) => sum + c.volume, 0);
  const avgVolume = totalVolume / recent.length;
  const latestVolume = candles[candles.length - 1]?.volume ?? 0;
  const volumeRatio = avgVolume > 0 ? latestVolume / avgVolume : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">Latest</span>
        <span className="numeric text-sm font-medium text-text-primary">
          {formatCurrency(latestVolume)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">Avg ({recent.length})</span>
        <span className="numeric text-sm text-text-secondary">
          {formatCurrency(avgVolume)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">Ratio</span>
        <span className={cn('numeric text-sm font-medium', volumeRatio > 1.5 ? 'text-market-up' : volumeRatio < 0.5 ? 'text-market-down' : 'text-text-primary')}>
          {volumeRatio.toFixed(2)}x
        </span>
      </div>
    </div>
  );
}

/**

 * Komponen FibonacciDisplay untuk merender bagian UI terkait fibonacci display.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function FibonacciDisplay({ fib }: { fib: FibonacciResult }) {
  return (
    <div className="space-y-1.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium text-text-muted">Direction</span>
        <span className={cn(
          'text-xs font-semibold capitalize',
          fib.direction === 'uptrend' ? 'text-market-up' : 'text-market-down'
        )}>
          {fib.direction}
        </span>
      </div>
      {fib.levels.map((level) => {
        const isKey = level.level === 0.382 || level.level === 0.5 || level.level === 0.618;
        return (
          <div key={level.level} className="flex items-center justify-between">
            <span className={cn(
              'text-xs',
              isKey ? 'font-semibold text-accent-primary' : 'text-text-muted'
            )}>
              {level.label}
            </span>
            <span className={cn(
              'numeric text-xs',
              isKey ? 'font-semibold text-text-primary' : 'text-text-secondary'
            )}>
              {formatCurrency(level.price)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**

 * Komponen OrderBlockDisplay untuk merender bagian UI terkait order block display.

 * Menjaga struktur tampilan tetap terpisah dari halaman atau komponen induk.

 */

function OrderBlockDisplay({ blocks }: { blocks: OrderBlock[] }) {
  return (
    <div className="space-y-2">
      {blocks.slice(-3).map((block, i) => {
        const isBullish = block.type === 'bullish';
        return (
          <div
            key={`${block.openTime}-${i}`}
            className={cn(
              'rounded-md border px-2.5 py-2',
              isBullish
                ? 'border-market-up/20 bg-market-up/5'
                : 'border-market-down/20 bg-market-down/5'
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn(
                'text-[10px] font-bold uppercase',
                isBullish ? 'text-market-up' : 'text-market-down'
              )}>
                {block.type} OB
              </span>
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                block.strength === 'strong' && 'bg-market-up/10 text-market-up',
                block.strength === 'moderate' && 'bg-accent-warm/10 text-accent-warm',
                block.strength === 'weak' && 'bg-bg-surface-raised text-text-muted'
              )}>
                {block.strength}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-text-muted">Zone</span>
              <span className="numeric text-text-secondary">
                {formatCurrency(block.low)} — {formatCurrency(block.high)}
              </span>
            </div>
            {block.tested && (
              <p className="mt-1 text-[10px] font-medium text-accent-warm">⚡ Tested</p>
            )}
          </div>
        );
      })}
      {blocks.length === 0 && (
        <p className="text-xs text-text-muted">No order blocks detected in this timeframe.</p>
      )}
    </div>
  );
}

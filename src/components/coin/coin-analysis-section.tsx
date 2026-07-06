'use client';

import { useMemo } from 'react';
import { TechnicalPanel } from '@/components/technical-analysis/technical-panel';
import { FuturesSignalPanel } from '@/components/technical-analysis/futures-signal-panel';
import { AiTechnicalSummary } from '@/components/ai-agent/ai-technical-summary';
import { AiChatPanel } from '@/components/ai-agent/ai-chat-panel';
import { BarChart3 } from 'lucide-react';
import type { Candle, ChartTimeframe, AnalysisResult } from '@/types/chart';
import type { TechnicalContext } from '@/types/ai';
import type { FuturesSignal } from '@/types/futures-signal';

type ChartMode = 'clean' | 'technical';

interface CoinAnalysisSectionProps {
  chartMode: ChartMode;
  candles: Candle[] | undefined;
  symbol: string;
  timeframe: ChartTimeframe;
  price: number | null | undefined;
  analysis: AnalysisResult | null;
  futuresSignal: FuturesSignal | null;
  activeIndicators: Set<string>;
  onSwitchToTechnical: () => void;
}

/**
 * Analysis section: technical panel, futures signal panel, AI chat, and the
 * "enable technical mode" CTA when in clean mode.
 *
 * Purely compositional — all data is passed in from the page.
 */
export function CoinAnalysisSection({
  chartMode,
  candles,
  symbol,
  timeframe,
  price,
  analysis,
  futuresSignal,
  activeIndicators,
  onSwitchToTechnical,
}: CoinAnalysisSectionProps) {
  const hasCandles = candles && candles.length > 0;
  const aiContext = useMemo<TechnicalContext | null>(() => {
    if (!analysis) return null;
    return {
      symbol,
      timeframe,
      price: price ?? undefined,
      rsi:
        analysis.rsi.value != null
          ? { value: analysis.rsi.value, status: analysis.rsi.status }
          : undefined,
      macd: analysis.macd
        ? {
            macd: analysis.macd.macd,
            signal: analysis.macd.signal,
            histogram: analysis.macd.histogram,
          }
        : undefined,
      trend: { value: analysis.trend.value, reasons: analysis.trend.reasons },
      supportResistance: {
        support: analysis.sr.support ?? null,
        resistance: analysis.sr.resistance ?? null,
        confidence: analysis.sr.confidence,
      },
      fibonacci: analysis.fib
        ? {
            direction: analysis.fib.direction,
            levels: analysis.fib.levels.map((level) => ({
              label: level.label,
              price: level.price,
            })),
          }
        : undefined,
      orderBlocks: analysis.orderBlocks
        .slice(-3)
        .map((block) => ({
          type: block.type,
          high: block.high,
          low: block.low,
          strength: block.strength,
        })),
    };
  }, [analysis, symbol, timeframe, price]);

  return (
    <>
      {/* Technical Analysis Panel — only in Technical Mode */}
      {chartMode === 'technical' && hasCandles && (
        <TechnicalPanel
          candles={candles}
          symbol={symbol}
          activeIndicators={activeIndicators}
          analysis={analysis}
        />
      )}

      {/* Futures Setup — disciplined LONG/SHORT/WAIT decision engine */}
      {chartMode === 'technical' && hasCandles && futuresSignal && (
        <FuturesSignalPanel signal={futuresSignal} symbol={symbol} timeframe={timeframe} />
      )}

      {/* AI Summary — sits directly above the advisor in Technical Mode */}
      {chartMode === 'technical' && (
        <AiTechnicalSummary context={aiContext} signal={futuresSignal} />
      )}

      {/* AI Technical Advisor — only in Technical Mode */}
      {chartMode === 'technical' && (
        <AiChatPanel
          symbol={symbol}
          timeframe={timeframe}
          currentPrice={price ?? undefined}
          analysis={analysis}
        />
      )}

      {/* Technical Mode CTA when in Clean Mode */}
      {chartMode === 'clean' && (
        <div className="card interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-medium text-text-secondary">Technical Analysis</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Switch to Technical Mode for RSI, MACD, MA, and Support/Resistance.
            </p>
          </div>
          <button
            onClick={onSwitchToTechnical}
            className="pressable inline-flex items-center gap-1.5 rounded-lg bg-accent-secondary/10 px-3 py-1.5 text-xs font-medium text-accent-secondary transition-all hover:bg-accent-secondary/20 hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Enable
          </button>
        </div>
      )}
    </>
  );
}

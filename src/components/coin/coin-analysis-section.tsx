'use client';

import { TechnicalPanel } from '@/components/technical-analysis/technical-panel';
import { FuturesSignalPanel } from '@/components/technical-analysis/futures-signal-panel';
import { AiChatPanel } from '@/components/ai-agent/ai-chat-panel';
import { BarChart3 } from 'lucide-react';
import type { Candle, ChartTimeframe, AnalysisResult } from '@/types/chart';
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

  return (
    <>
      {/* Technical Analysis Panel — only in Technical Mode */}
      {chartMode === 'technical' && hasCandles && (
        <TechnicalPanel
          candles={candles}
          symbol={symbol}
          timeframe={timeframe}
          currentPrice={price ?? undefined}
          activeIndicators={activeIndicators}
          analysis={analysis}
          signal={futuresSignal}
        />
      )}

      {/* Futures Setup — disciplined LONG/SHORT/WAIT decision engine */}
      {chartMode === 'technical' && hasCandles && futuresSignal && (
        <FuturesSignalPanel
          signal={futuresSignal}
          symbol={symbol}
          timeframe={timeframe}
        />
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
        <div className="card interactive flex items-center justify-between px-4 py-4">
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

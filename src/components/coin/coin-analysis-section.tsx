'use client';

import { useMemo } from 'react';
import { TechnicalPanel } from '@/components/technical-analysis/technical-panel';
import { ActionCallPanel } from '@/components/technical-analysis/action-call';
import { AiTechnicalSummary } from '@/components/signal-agent/ai-technical-summary';
import { AiChatPanel } from '@/components/signal-agent/ai-chat-panel';
import { BarChart3 } from 'lucide-react';
import type { Candle, ChartTimeframe, AnalysisResult } from '@/types/chart';
import type { TechnicalContext } from '@/types/ai';
import type { ActionCallView } from '@/types/action-call';

type ChartMode = 'clean' | 'technical';

interface CoinAnalysisSectionProps {
  chartMode: ChartMode;
  candles: Candle[] | undefined;
  symbol: string;
  timeframe: ChartTimeframe;
  price: number | null | undefined;
  analysis: AnalysisResult | null;
  actionCall: ActionCallView | null;
  actionCallLoading?: boolean;
  actionCallError?: string | null;
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
  actionCall,
  actionCallLoading = false,
  actionCallError = null,
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
      orderBlocks: analysis.orderBlocks.slice(-3).map((block) => ({
        type: block.type,
        high: block.high,
        low: block.low,
        strength: block.strength,
      })),
    };
  }, [analysis, symbol, timeframe, price]);

  return (
    <>
      {chartMode === 'technical' && hasCandles && (
        <div className="space-y-3">
          <TechnicalPanel
            candles={candles}
            symbol={symbol}
            activeIndicators={activeIndicators}
            analysis={analysis}
          />

          {(actionCall || actionCallLoading || actionCallError) && (
            <ActionCallPanel
              signal={
                actionCall ?? {
                  action: 'WAIT',
                  status: 'HOLD',
                  signal: 'HOLD',
                  bias: 'NEUTRAL',
                  trend: 'SIDEWAYS',
                  timeframe,
                  confidenceScore: 0,
                  signalGrade: 'D',
                  entryTrigger: 'NO_TRIGGER',
                  regime: 'INSUFFICIENT_DATA',
                  entryZone: { min: null, max: null },
                  stopLoss: null,
                  takeProfits: { tp1: null, tp2: null, tp3: null },
                  riskRewardRatio: null,
                  suggestedLeverage: { min: 0, max: 0 },
                  riskLevel: 'NO_TRADE',
                  invalidationReason: actionCallError ?? 'No actionable setup.',
                  summary: actionCallLoading ? 'Loading…' : 'No setup',
                  reasons: [],
                  warnings: [],
                  noTradeReasons: actionCallError ? [actionCallError] : [],
                  primaryNoTradeReason: actionCallError ?? 'No actionable setup.',
                  mtfConfirmation: {
                    macroBias: 'NEUTRAL',
                    setupBias: 'NEUTRAL',
                    triggerBias: 'NEUTRAL',
                    alignmentScore: 0,
                    conflicts: [],
                  },
                  positioning: {
                    fundingRate: null,
                    fundingBias: 'UNAVAILABLE',
                    openInterestChangePercent: null,
                    openInterestBias: 'UNAVAILABLE',
                  },
                  liquiditySweep: {
                    type: 'NONE',
                    sweptLevel: null,
                    confidence: 0,
                  },
                  scoreBreakdown: {
                    trendScore: 0,
                    momentumScore: 0,
                    volumeScore: 0,
                    structureScore: 0,
                    riskScore: 0,
                    finalScore: 0,
                  },
                  confidence: 0,
                  grade: 'D',
                  marketRegime: 'unknown',
                  tradePermission: 'no_trade',
                  dataHealth: {
                    ok: true,
                    symbol: { provided: true, valid: true, reason: null },
                    setup: {
                      required: true,
                      candleCount: 0,
                      minCandlesRequired: 0,
                      lastCandleAgeSec: null,
                      maxAgeSec: 0,
                      ok: true,
                      reason: null,
                    },
                    macro: {
                      required: false,
                      candleCount: 0,
                      minCandlesRequired: 0,
                      lastCandleAgeSec: null,
                      maxAgeSec: 0,
                      ok: true,
                      reason: null,
                    },
                    trigger: {
                      required: false,
                      candleCount: 0,
                      minCandlesRequired: 0,
                      lastCandleAgeSec: null,
                      maxAgeSec: 0,
                      ok: true,
                      reason: null,
                    },
                    funding: { available: false, ageSec: null, maxAgeSec: 0, ok: true },
                    openInterest: { available: false, ageSec: null, maxAgeSec: 0, ok: true },
                    reasons: [],
                    confidenceCap: 100,
                  },
                  entryStatus: 'not_triggered',
                  riskApproval: 'not_applicable',
                  invalidation: actionCallError ?? 'No actionable setup.',
                  reason: [],
                  forecastAlignment: 'unavailable',
                  forecastConfidenceAdjustment: 0,
                  forecastWarnings: [],
                  forecastUsedInDecision: false,
                  lateEntryBlocked: false,
                  lateEntryReason: null,
                  sourceEngine: 'python_action_call',
                  pythonSignal: 'HOLD',
                  pythonStatus: 'HOLD',
                  pythonBias: 'NEUTRAL',
                  pythonTrend: 'SIDEWAYS',
                }
              }
              symbol={symbol}
              timeframe={timeframe}
              isLoading={actionCallLoading}
              error={actionCallError}
            />
          )}

          <AiTechnicalSummary context={aiContext} />

          <AiChatPanel
            symbol={symbol}
            timeframe={timeframe}
            currentPrice={price ?? undefined}
            analysis={analysis}
          />
        </div>
      )}

      {/* Technical Mode CTA when in Clean Mode */}
      {chartMode === 'clean' && (
        <div className="card interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring flex items-center justify-between px-4 py-3">
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

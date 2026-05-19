/**
 * Single candle data point from Binance Kline API.
 */
export type Candle = {
  symbol: string;
  binanceSymbol: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

/**
 * Supported chart timeframes — extended for technical analysis.
 */
export type ChartTimeframe = '5m' | '15m' | '30m' | '1H' | '4H' | '24H' | '7D' | '30D';

/**
 * Chart data point for line chart rendering.
 */
export type ChartDataPoint = {
  time: number;
  value: number;
};

/**
 * Pre-computed technical analysis result.
 * Calculated once in the parent and shared across TechnicalPanel and AiChatPanel.
 */
export type AnalysisResult = {
  rsi: import('@/lib/domain/indicators/rsi').RsiResult;
  macd: import('@/lib/domain/indicators/macd').MacdPoint | null;
  sr: import('@/lib/domain/indicators/support-resistance').SupportResistance;
  trend: import('@/lib/domain/indicators/trend-label').TrendLabel;
  fib: import('@/lib/domain/indicators/fibonacci').FibonacciResult | null;
  orderBlocks: import('@/lib/domain/indicators/order-block').OrderBlock[];
};

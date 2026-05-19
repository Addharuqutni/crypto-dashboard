import type { Candle } from '@/types/chart';

export type FibonacciLevel = {
  level: number;
  label: string;
  price: number;
};

export type FibonacciResult = {
  levels: FibonacciLevel[];
  swingHigh: number;
  swingLow: number;
  direction: 'uptrend' | 'downtrend';
};

/** Standard Fibonacci retracement levels */
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

const FIB_LABELS: Record<number, string> = {
  0: '0%',
  0.236: '23.6%',
  0.382: '38.2%',
  0.5: '50%',
  0.618: '61.8%',
  0.786: '78.6%',
  1: '100%',
};

/**
 * Calculate Fibonacci Retracement levels from candle data.
 * 
 * Logic:
 * 1. Identify the swing high and swing low within the lookback period.
 * 2. Determine trend direction (uptrend if close > open of the range).
 * 3. Calculate retracement levels between swing high and swing low.
 * 
 * In an uptrend: levels are measured from swing low to swing high.
 * In a downtrend: levels are measured from swing high to swing low.
 */
export function calculateFibonacci(candles: Candle[], lookback = 50): FibonacciResult | null {
  if (candles.length < 10) return null;

  const recent = candles.slice(-lookback);

  // Find swing high and swing low
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let highIndex = 0;
  let lowIndex = 0;

  for (let i = 0; i < recent.length; i++) {
    if (recent[i]!.high > swingHigh) {
      swingHigh = recent[i]!.high;
      highIndex = i;
    }
    if (recent[i]!.low < swingLow) {
      swingLow = recent[i]!.low;
      lowIndex = i;
    }
  }

  if (swingHigh === swingLow) return null;

  // Determine direction: if high came after low, it's an uptrend
  const direction: FibonacciResult['direction'] = highIndex > lowIndex ? 'uptrend' : 'downtrend';
  const range = swingHigh - swingLow;

  // Calculate levels
  const levels: FibonacciLevel[] = FIB_LEVELS.map((level) => {
    let price: number;

    if (direction === 'uptrend') {
      // Retracement from high: price = high - (range * level)
      price = swingHigh - range * level;
    } else {
      // Retracement from low: price = low + (range * level)
      price = swingLow + range * level;
    }

    return {
      level,
      label: FIB_LABELS[level] ?? `${(level * 100).toFixed(1)}%`,
      price,
    };
  });

  return {
    levels,
    swingHigh,
    swingLow,
    direction,
  };
}

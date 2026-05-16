import type { MarketRow } from '@/types/market';
import type { CoinRegistryItem } from '@/types/coin';

/**
 * Generate mock market data for development.
 * Provides realistic-looking data for all default coins.
 */
export function generateMockMarketData(coins: CoinRegistryItem[]): MarketRow[] {
  const mockPrices: Record<string, { price: number; change: number; volume: number; marketCap: number }> = {
    BTC: { price: 67245.2, change: 2.45, volume: 28_500_000_000, marketCap: 1_320_000_000_000 },
    ETH: { price: 3456.78, change: -1.12, volume: 15_200_000_000, marketCap: 415_000_000_000 },
    BNB: { price: 612.34, change: 0.87, volume: 1_800_000_000, marketCap: 94_000_000_000 },
    SOL: { price: 178.92, change: 4.23, volume: 3_200_000_000, marketCap: 78_000_000_000 },
    XRP: { price: 0.5234, change: -0.45, volume: 1_100_000_000, marketCap: 28_000_000_000 },
    ADA: { price: 0.4567, change: 1.23, volume: 450_000_000, marketCap: 16_000_000_000 },
    DOGE: { price: 0.1523, change: -2.34, volume: 890_000_000, marketCap: 21_000_000_000 },
    AVAX: { price: 38.45, change: 3.12, volume: 520_000_000, marketCap: 14_500_000_000 },
    DOT: { price: 7.23, change: -0.89, volume: 320_000_000, marketCap: 9_800_000_000 },
    LINK: { price: 14.56, change: 1.67, volume: 680_000_000, marketCap: 8_500_000_000 },
    MATIC: { price: 0.7234, change: -1.45, volume: 410_000_000, marketCap: 6_700_000_000 },
    UNI: { price: 9.87, change: 2.34, volume: 290_000_000, marketCap: 5_900_000_000 },
    ATOM: { price: 8.92, change: 0.56, volume: 210_000_000, marketCap: 3_400_000_000 },
    LTC: { price: 84.56, change: -0.23, volume: 380_000_000, marketCap: 6_300_000_000 },
    FIL: { price: 5.67, change: 1.89, volume: 180_000_000, marketCap: 2_800_000_000 },
    APT: { price: 8.34, change: -3.12, volume: 240_000_000, marketCap: 3_600_000_000 },
    ARB: { price: 1.12, change: 2.78, volume: 560_000_000, marketCap: 4_200_000_000 },
    OP: { price: 2.34, change: 1.45, volume: 320_000_000, marketCap: 2_500_000_000 },
    NEAR: { price: 6.78, change: -0.67, volume: 290_000_000, marketCap: 7_100_000_000 },
    SUI: { price: 1.45, change: 5.67, volume: 780_000_000, marketCap: 4_800_000_000 },
  };

  return coins.map((coin): MarketRow => {
    const mock = mockPrices[coin.symbol] ?? {
      price: Math.random() * 100,
      change: (Math.random() - 0.5) * 10,
      volume: Math.random() * 1_000_000_000,
      marketCap: Math.random() * 10_000_000_000,
    };

    return {
      symbol: coin.symbol,
      name: coin.name,
      price: mock.price,
      priceChangePercent24h: mock.change,
      volume24h: mock.volume,
      marketCap: mock.marketCap,
      high24h: mock.price * 1.02,
      low24h: mock.price * 0.97,
      isLive: false,
      isStale: false,
      lastUpdatedAt: Date.now(),
    };
  });
}

/**
 * Generate mock chart data points for a given timeframe.
 */
export function generateMockChartData(
  basePrice: number,
  timeframe: '5m' | '15m' | '30m' | '1H' | '4H' | '24H' | '7D' | '30D'
): { time: number; value: number }[] {
  const now = Date.now();
  let points: number;
  let interval: number;

  switch (timeframe) {
    case '5m':
      points = 5;
      interval = 60 * 1000; // 1 minute
      break;
    case '15m':
      points = 15;
      interval = 60 * 1000;
      break;
    case '30m':
      points = 30;
      interval = 60 * 1000;
      break;
    case '1H':
      points = 60;
      interval = 60 * 1000;
      break;
    case '4H':
      points = 48;
      interval = 5 * 60 * 1000; // 5 minutes
      break;
    case '24H':
      points = 96;
      interval = 15 * 60 * 1000; // 15 minutes
      break;
    case '7D':
      points = 42;
      interval = 4 * 60 * 60 * 1000; // 4 hours
      break;
    case '30D':
      points = 30;
      interval = 24 * 60 * 60 * 1000; // 1 day
      break;
  }

  const data: { time: number; value: number }[] = [];
  let price = basePrice * (0.9 + Math.random() * 0.1);

  for (let i = 0; i < points; i++) {
    const volatility = basePrice * 0.005;
    price += (Math.random() - 0.48) * volatility;
    price = Math.max(price, basePrice * 0.85);

    data.push({
      time: now - (points - i) * interval,
      value: price,
    });
  }

  return data;
}

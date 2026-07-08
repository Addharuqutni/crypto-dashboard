import { describe, it, expect, beforeEach } from 'vitest';
import { useMarketStore } from '../use-market-store';
import type { LivePrice } from '@/types/market';

function makePrice(symbol: string, price: number, receivedAt: number): LivePrice {
  return {
    symbol,
    binanceSymbol: `${symbol}USDT`,
    price,
    eventTime: receivedAt,
    receivedAt,
    source: 'binance',
  };
}

describe('useMarketStore', () => {
  beforeEach(() => {
    useMarketStore.setState({
      prices: {},
      pricesByBinanceSymbol: {},
      validSymbols: new Set(),
      validSymbolsStatus: 'idle',
      connectionStatus: 'disconnected',
      lastUpdateAt: null,
      trackedSymbolCount: 0,
    });
  });

  describe('updatePrice', () => {
    it('increments trackedSymbolCount for new symbol', () => {
      useMarketStore.getState().updatePrice(makePrice('BTC', 65000, 1000));
      expect(useMarketStore.getState().trackedSymbolCount).toBe(1);
    });

    it('does not increment trackedSymbolCount for existing symbol', () => {
      useMarketStore.getState().updatePrice(makePrice('BTC', 65000, 1000));
      useMarketStore.getState().updatePrice(makePrice('BTC', 66000, 2000));
      expect(useMarketStore.getState().trackedSymbolCount).toBe(1);
    });

    it('stores price in both maps', () => {
      useMarketStore.getState().updatePrice(makePrice('BTC', 65000, 1000));
      const state = useMarketStore.getState();
      expect(state.prices['BTC']?.price).toBe(65000);
      expect(state.pricesByBinanceSymbol['BTCUSDT']?.price).toBe(65000);
    });

    it('updates lastUpdateAt', () => {
      useMarketStore.getState().updatePrice(makePrice('BTC', 65000, 5000));
      expect(useMarketStore.getState().lastUpdateAt).toBe(5000);
    });
  });

  describe('updatePrices (batch)', () => {
    it('increments trackedSymbolCount only for new symbols in batch', () => {
      useMarketStore.getState().updatePrice(makePrice('BTC', 65000, 1000));
      useMarketStore.getState().updatePrices([
        makePrice('BTC', 66000, 2000),
        makePrice('ETH', 3500, 2001),
        makePrice('ETH', 3510, 2002),
      ]);
      expect(useMarketStore.getState().trackedSymbolCount).toBe(2);
    });

    it('sets lastUpdateAt to highest receivedAt in batch', () => {
      useMarketStore.getState().updatePrices([
        makePrice('BTC', 65000, 1000),
        makePrice('ETH', 3500, 3000),
        makePrice('SOL', 150, 2000),
      ]);
      expect(useMarketStore.getState().lastUpdateAt).toBe(3000);
    });

    it('preserves existing lastUpdateAt when batch has older timestamps', () => {
      useMarketStore.setState({ lastUpdateAt: 5000 });
      useMarketStore.getState().updatePrices([
        makePrice('BTC', 65000, 1000),
        makePrice('ETH', 3500, 2000),
      ]);
      expect(useMarketStore.getState().lastUpdateAt).toBe(5000);
    });

    it('stores all prices in both maps', () => {
      useMarketStore.getState().updatePrices([
        makePrice('BTC', 65000, 1000),
        makePrice('ETH', 3500, 2000),
      ]);
      const state = useMarketStore.getState();
      expect(Object.keys(state.prices)).toHaveLength(2);
      expect(Object.keys(state.pricesByBinanceSymbol)).toHaveLength(2);
    });
  });

  describe('isValidSymbol', () => {
    it('returns true when status is idle (degraded mode)', () => {
      useMarketStore.setState({ validSymbolsStatus: 'idle' });
      expect(useMarketStore.getState().isValidSymbol('BTCUSDT')).toBe(true);
    });

    it('returns true when status is failed (degraded mode)', () => {
      useMarketStore.setState({ validSymbolsStatus: 'failed' });
      expect(useMarketStore.getState().isValidSymbol('BTCUSDT')).toBe(true);
    });

    it('returns true when status is ready and symbol exists', () => {
      useMarketStore.setState({
        validSymbols: new Set(['BTCUSDT', 'ETHUSDT']),
        validSymbolsStatus: 'ready',
      });
      expect(useMarketStore.getState().isValidSymbol('BTCUSDT')).toBe(true);
    });

    it('returns false when status is ready and symbol does not exist', () => {
      useMarketStore.setState({
        validSymbols: new Set(['BTCUSDT']),
        validSymbolsStatus: 'ready',
      });
      expect(useMarketStore.getState().isValidSymbol('FAKEUSDT')).toBe(false);
    });
  });

  describe('setValidSymbols', () => {
    it('sets symbols and status to ready', () => {
      const symbols = new Set(['BTCUSDT', 'ETHUSDT']);
      useMarketStore.getState().setValidSymbols(symbols);
      const state = useMarketStore.getState();
      expect(state.validSymbols).toBe(symbols);
      expect(state.validSymbolsStatus).toBe('ready');
    });
  });

  describe('setConnectionStatus', () => {
    it('sets connection status', () => {
      useMarketStore.getState().setConnectionStatus('connected');
      expect(useMarketStore.getState().connectionStatus).toBe('connected');
    });
  });
});

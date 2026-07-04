/**
 * Barrel export for Binance Futures module — server-side klines only.
 *
 * Other Binance consumers import directly from the leaf modules
 * (binance-futures-client, binance-futures-normalizers, intervals) so this
 * barrel stays minimal: just the shared klines fetcher + error type.
 */
export { fetchKlines, KlineFetchError, type FetchKlinesArgs } from './futures-klines';

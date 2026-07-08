import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watchlist · CryptoHawk',
};

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}

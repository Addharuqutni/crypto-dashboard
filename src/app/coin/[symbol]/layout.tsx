import type { Metadata } from 'next';

export function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  return params.then((p) => ({
    title: `${p.symbol.toUpperCase()} · CryptoHawk`,
  }));
}

export default function CoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}

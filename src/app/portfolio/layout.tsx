import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portfolio · CryptoHawk',
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}

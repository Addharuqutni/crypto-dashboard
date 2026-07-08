import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Price Alerts · CryptoHawk',
};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

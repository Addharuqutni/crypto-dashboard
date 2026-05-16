import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/components/providers/query-provider';
import { DataProvider } from '@/components/providers/data-provider';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'CryptoHar',
  description:
    'Monitor crypto prices in real-time, track your portfolio, manage watchlists, and analyze market trends with technical indicators.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg-app text-text-primary antialiased">
        <QueryProvider>
          <DataProvider>
            <ToastProvider>
              <div className="flex min-h-screen flex-col">{children}</div>
            </ToastProvider>
          </DataProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

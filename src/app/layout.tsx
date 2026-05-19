import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/components/providers/query-provider';
import { DataProvider } from '@/components/providers/data-provider';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Self-hosted body font. CSS variable feeds the existing `--font-body`
 * token so the rest of the app can keep using `font-body` / system-ui
 * fallbacks without changes.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

/**
 * Self-hosted display font for headings and brand. Mirrors `--font-display`
 * so existing `font-[family-name:var(--font-display)]` references keep
 * working without code changes across pages.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'CryptoHawk',
  description:
    'Monitor crypto prices in real-time, track your portfolio, manage watchlists, and analyze market trends with technical indicators.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${spaceGrotesk.variable}`}>
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


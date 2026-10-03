import type { Metadata, Viewport } from 'next';
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

/**
 * The app is dark-first; declaring the scheme and theme color here paints the
 * browser chrome (address bar / status bar) to match instead of defaulting to
 * white, which reads as a flash on load and clashes with the OLED palette.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
  themeColor: '#05070d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${spaceGrotesk.variable}`}>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-bg-app text-text-primary antialiased"
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-overlay focus:rounded-lg focus:bg-accent-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-bg-app focus:outline-none focus:ring-2 focus:ring-focus-ring"
        >
          Skip to main content
        </a>
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

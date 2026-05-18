'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Star, Wallet, Bell, BookOpen, FlaskConical, Crosshair, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SearchCoin } from '@/components/search/search-coin';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/screener', label: 'Screener', icon: Crosshair },
  { href: '/watchlist', label: 'Watchlist', icon: Star },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/backtest', label: 'Backtest', icon: FlaskConical },
] as const;

/**
 * App header — brand, navigation, global search, and mobile menu.
 * Kept slim and precise per ui-spec.md.
 */
export function AppHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 lg:px-6">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-text-primary"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <BarChart3 className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">CryptoHar</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  'hover:bg-bg-surface-raised hover:text-text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  isActive ? 'bg-bg-surface-raised text-text-primary' : 'text-text-secondary'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Global Search */}
        <div className="ml-auto flex-1 md:max-w-xs lg:max-w-sm">
          <SearchCoin />
        </div>

        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:hidden"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav
          className="border-t border-border-subtle bg-bg-surface px-4 py-3 md:hidden"
          aria-label="Mobile navigation"
        >
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-bg-surface-raised text-text-primary' : 'text-text-secondary'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}

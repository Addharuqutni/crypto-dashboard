'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Star, Wallet, Bell, BookOpen, FlaskConical, Crosshair, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/shared/utils';
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
 * Kept slim so global navigation stays scannable on every viewport.
 */
export function AppHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-header border-b border-border-subtle bg-bg-app/95 backdrop-blur-sm">
      <div className="container-app flex h-16 items-center gap-4">
        {/* Brand */}
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-xl pr-1 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label="Go to CryptoHawk dashboard"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-subtle bg-bg-surface text-accent-primary transition-colors group-hover:border-border-strong">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="hidden sm:inline">CryptoHawk</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-bg-surface hover:text-text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  isActive ? 'text-text-primary' : 'text-text-secondary'
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
                {isActive && (
                  <span
                    className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-accent-primary"
                    aria-hidden="true"
                  />
                )}
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
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="tap-target rounded-xl text-text-secondary hover:bg-bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:hidden"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav
          className="border-t border-border-subtle bg-bg-app px-4 py-3 md:hidden"
          aria-label="Mobile navigation"
        >
          <div className="flex flex-col gap-1.5">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    isActive
                      ? 'border border-border-subtle bg-bg-surface text-text-primary'
                      : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary'
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
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

'use client';

import { Shield, ChevronDown } from 'lucide-react';
import { useState, useId } from 'react';
import { useRiskProfileStore } from '@/stores/use-risk-profile-store';
import { cn } from '@/lib/utils';
import type { RiskProfile } from '@/types/intelligence';

/**
 * Risk Profile picker.
 *
 * Compact inline component intended for placement next to the Futures Signal
 * panel header. The selected profile influences confidence floors, risk:reward
 * minimums, leverage ceilings, and alert frequency through `applyProfile`.
 *
 * The component itself does not enforce thresholds — it only persists the
 * choice. Consumers must apply the profile explicitly.
 */
export function RiskProfilePicker({ className }: { className?: string }) {
  const profileId = useRiskProfileStore((s) => s.profileId);
  const setProfile = useRiskProfileStore((s) => s.setProfile);
  const allProfiles = useRiskProfileStore((s) => s.allProfiles());
  const [open, setOpen] = useState(false);
  const id = useId();

  const current = allProfiles.find((p) => p.id === profileId) ?? allProfiles[0]!;

  return (
    <div className={cn('relative inline-block text-left', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent-primary/30 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Shield className="h-3 w-3 text-accent-primary" />
        Profile: <span className="font-semibold text-text-primary">{current.label}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          {/* Click-away */}
          <button
            type="button"
            aria-hidden
            className="fixed inset-0 z-10 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <ul
            id={`${id}-menu`}
            role="listbox"
            className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-border-subtle bg-bg-surface-raised shadow-xl"
          >
            {allProfiles.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.id === profileId}
                  onClick={() => {
                    setProfile(p.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'block w-full text-left transition-colors',
                    'hover:bg-bg-surface-soft focus-visible:outline-none focus-visible:bg-bg-surface-soft',
                    p.id === profileId && 'bg-accent-primary/5'
                  )}
                >
                  <ProfileRow profile={p} active={p.id === profileId} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ProfileRow({ profile, active }: { profile: RiskProfile; active: boolean }) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-xs font-semibold',
            active ? 'text-accent-primary' : 'text-text-primary'
          )}
        >
          {profile.label}
        </span>
        <span className="text-[10px] text-text-muted">
          conf ≥ {profile.minConfidence} · RR ≥ {profile.minRiskReward}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{profile.description}</p>
      <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
        <Badge label={`max ${profile.maxLeverage}x`} />
        <Badge label={profile.allowCountertrend ? 'countertrend ok' : 'no countertrend'} />
        <Badge label={`cooldown ×${profile.cooldownMultiplier}`} />
      </div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-sm border border-border-subtle bg-bg-surface-soft px-1.5 py-0.5 text-[10px] text-text-muted">
      {label}
    </span>
  );
}

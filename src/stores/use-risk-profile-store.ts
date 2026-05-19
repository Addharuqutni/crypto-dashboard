import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getRiskProfile, RISK_PROFILES } from '@/lib/domain/intelligence/risk-profile';
import type { RiskProfile, RiskProfileId } from '@/types/intelligence';

/**
 * Risk-profile store.
 *
 * Single source of truth for the user's discipline preset. Persisted to
 * localStorage so the choice survives reloads. Defaults to `balanced` —
 * the safer middle ground.
 *
 * Consumers should treat the profile as read-only context. Anything that
 * needs to *apply* discipline thresholds should call `applyProfile()` from
 * `@/lib/domain/intelligence/risk-profile` rather than mutating fields locally.
 */

interface RiskProfileState {
  profileId: RiskProfileId;
  hydrated: boolean;
  setProfile: (id: RiskProfileId) => void;
  /** Convenience: returns the full profile object. */
  getProfile: () => RiskProfile;
  /** All available presets, exposed for the picker UI. */
  allProfiles: () => RiskProfile[];
}

export const useRiskProfileStore = create<RiskProfileState>()(
  persist(
    (set, get) => ({
      profileId: 'balanced',
      hydrated: false,
      setProfile: (id) => set({ profileId: id }),
      getProfile: () => getRiskProfile(get().profileId),
      allProfiles: () => Object.values(RISK_PROFILES),
    }),
    {
      name: 'crypto-risk-profile',
      partialize: (state) => ({ profileId: state.profileId }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);

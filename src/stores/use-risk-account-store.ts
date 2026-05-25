import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Risk Account store.
 *
 * Holds the user's account size and per-trade risk fraction. Used by the
 * position-sizing utility to convert engine entry/SL output into concrete
 * qty/notional/leverage numbers.
 *
 * Why this is separate from `useRiskProfileStore`:
 *   - The profile is a discipline preset (RR floor, leverage cap, allow-
 *     countertrend, cooldowns). It does not contain personal capital.
 *   - The account values are sensitive only to the user's wallet sizing
 *     decisions and should never accidentally end up serialised in screener
 *     URLs or shared exports. Keeping them in their own store makes that
 *     boundary obvious.
 *
 * Persistence:
 *   - localStorage via zustand `persist`. No external sync.
 *   - Defaults are intentionally pessimistic: $1000 demo equity, 1% risk
 *     per trade — the most-cited value in disciplined-trading literature.
 *
 * Sanitisation:
 *   - The setters clamp values to safe ranges so a stray paste of "100000%"
 *     can never produce an absurd plan.
 */

interface RiskAccountState {
  /** Total account equity in USDT used for sizing. */
  accountSize: number;
  /** Risk per trade as a fraction (0.01 = 1%). */
  riskPerTrade: number;
  hydrated: boolean;
  setAccountSize: (value: number) => void;
  setRiskPerTrade: (fraction: number) => void;
}

const MIN_ACCOUNT_SIZE = 1; // USDT
const MAX_ACCOUNT_SIZE = 1_000_000_000;
const MIN_RISK_PER_TRADE = 0.0001; // 0.01%
const MAX_RISK_PER_TRADE = 0.5; // 50% — well above what we'd recommend, but a hard ceiling

export const DEFAULT_ACCOUNT_SIZE = 1_000;
export const DEFAULT_RISK_PER_TRADE = 0.01;

export const useRiskAccountStore = create<RiskAccountState>()(
  persist(
    (set) => ({
      accountSize: DEFAULT_ACCOUNT_SIZE,
      riskPerTrade: DEFAULT_RISK_PER_TRADE,
      hydrated: false,
      setAccountSize: (value) => {
        if (!Number.isFinite(value)) return;
        const clamped = Math.min(MAX_ACCOUNT_SIZE, Math.max(MIN_ACCOUNT_SIZE, value));
        set({ accountSize: clamped });
      },
      setRiskPerTrade: (fraction) => {
        if (!Number.isFinite(fraction)) return;
        const clamped = Math.min(
          MAX_RISK_PER_TRADE,
          Math.max(MIN_RISK_PER_TRADE, fraction)
        );
        set({ riskPerTrade: clamped });
      },
    }),
    {
      name: 'crypto-dashboard.risk-account.v1',
      partialize: (state) => ({
        accountSize: state.accountSize,
        riskPerTrade: state.riskPerTrade,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);

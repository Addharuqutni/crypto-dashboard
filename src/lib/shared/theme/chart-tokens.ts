// ponytail: lightweight-charts needs concrete hex, can't read CSS vars.
// Single source of truth for chart + fear-greed colors. Sync with globals.css tokens.
export const CHART_COLORS = {
  textMuted: '#94a3b8',
  crosshairLabelBg: '#1e293b',
  gridLine: 'rgba(31, 41, 55, 0.3)',
  priceScaleBorder: 'rgba(31, 41, 55, 0.5)',
  crosshairLine: 'rgba(56, 189, 248, 0.4)',
  marketUp: '#22c55e',
  marketDown: '#ef4444',
  wickUp: 'rgba(34, 197, 94, 0.8)',
  wickDown: 'rgba(239, 68, 68, 0.8)',
} as const;

export const MA_COLORS = {
  MA7: '#facc15',
  MA25: '#38bdf8',
  MA99: '#a78bfa',
} as const;

export const FEAR_GREED_GRADIENT = 'linear-gradient(to right, #ef4444, #f59e0b, #22c55e)';

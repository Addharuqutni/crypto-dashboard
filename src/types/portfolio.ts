/**
 * Portfolio holding stored in localStorage.
 */
export type PortfolioHolding = {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  averageBuyPrice?: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Calculated portfolio summary.
 */
export type PortfolioSummary = {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPercent: number | null;
  holdingsCount: number;
};

/**
 * Calculated holding with current value and P/L.
 */
export type CalculatedHolding = PortfolioHolding & {
  currentPrice?: number;
  currentValue: number;
  pnl: number | null;
  pnlPercent: number | null;
};

/**
 * Price alert stored in localStorage.
 */
export type PriceAlert = {
  id: string;
  symbol: string;
  condition: 'greater_than' | 'less_than';
  targetPrice: number;
  status: 'active' | 'triggered';
  createdAt: string;
  triggeredAt?: string;
};

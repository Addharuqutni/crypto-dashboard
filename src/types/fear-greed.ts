/**
 * Fear & Greed Index data from Alternative.me API.
 */
export type FearGreedData = {
  value: number;
  label: FearGreedLabel;
  timestamp: number;
  fetchedAt: number;
};

export type FearGreedLabel =
  | 'Extreme Fear'
  | 'Fear'
  | 'Neutral'
  | 'Greed'
  | 'Extreme Greed';

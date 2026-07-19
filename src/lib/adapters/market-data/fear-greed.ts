import type { FearGreedData, FearGreedLabel } from '@/types/fear-greed';

const FEAR_GREED_API = 'https://api.alternative.me/fng/?limit=1&format=json';

/**
 * Fetch the current Fear & Greed Index from Alternative.me.
 * Returns normalized FearGreedData or null on failure.
 * This API updates once daily.
 */
export async function fetchFearGreedIndex(): Promise<FearGreedData | null> {
  try {
    const response = await fetch(FEAR_GREED_API, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 }, // Cache 1 hour in Next.js
    });

    if (!response.ok) {
      throw new Error(`Fear & Greed API error: ${response.status}`);
    }

    const raw = (await response.json()) as AlternativeMeResponse;

    if (!raw.data || raw.data.length === 0) {
      return null;
    }

    const entry = raw.data[0]!;
    const value = parseInt(entry.value, 10);

    if (isNaN(value)) return null;

    return {
      value,
      label: classifyFearGreed(value),
      timestamp: parseInt(entry.timestamp, 10) * 1000, // Convert to ms
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Fear & Greed] Failed to fetch index:', error);
    return null;
  }
}

/**
 * Classify numeric value into Fear & Greed label.
 * 0-24: Extreme Fear, 25-44: Fear, 45-55: Neutral, 56-74: Greed, 75-100: Extreme Greed
 */
function classifyFearGreed(value: number): FearGreedLabel {
  if (value <= 24) return 'Extreme Fear';
  if (value <= 44) return 'Fear';
  if (value <= 55) return 'Neutral';
  if (value <= 74) return 'Greed';
  return 'Extreme Greed';
}

// --- Alternative.me API Types ---

interface AlternativeMeResponse {
  name: string;
  data: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
    time_until_update: string;
  }>;
}

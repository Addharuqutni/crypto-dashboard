/**
 * Public barrel for the intelligence module.
 *
 * Remaining after the Python Action Call cutover:
 *   - AI auditor helpers (explain-only LLM prompts)
 *
 * Risk profile presets live in `@/lib/domain/risk/risk-profile`.
 */

export { buildAuditorUserPrompt, parseAuditorResponse } from './ai-auditor';
export type { AiAuditorInput } from '@/types/intelligence';

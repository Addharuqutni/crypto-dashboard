import { describe, expect, it } from 'vitest';
import { sanitizeAgentSummary } from '../agent-runner';

describe('agent-runner hardening', () => {
  it('sanitizes markdown fences and whitespace', () => {
    expect(sanitizeAgentSummary('```\n  Setup valid.   Tunggu konfirmasi.\n```')).toBe(
      'Setup valid. Tunggu konfirmasi.'
    );
  });

  it('rejects forbidden trading claims', () => {
    expect(sanitizeAgentSummary('Gunakan leverage tinggi untuk entry ini.')).toBeNull();
    expect(sanitizeAgentSummary('Profit terjamin jika masuk sekarang.')).toBeNull();
    expect(sanitizeAgentSummary('Masukkan API key exchange dulu.')).toBeNull();
  });
});

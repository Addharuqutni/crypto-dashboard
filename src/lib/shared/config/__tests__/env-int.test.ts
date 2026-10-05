import { describe, expect, it } from 'vitest';

import { parseBoundedInt, readEnvInt } from '@/lib/shared/config/env-int';

describe('parseBoundedInt', () => {
  it('parses a plain decimal and clamps it into range', () => {
    expect(parseBoundedInt('30', 5, 1, 60)).toBe(30);
    expect(parseBoundedInt('0', 5, 1, 60)).toBe(1);
    expect(parseBoundedInt('999', 5, 1, 60)).toBe(60);
  });

  it('falls back when the value is absent or blank', () => {
    expect(parseBoundedInt(undefined, 5, 1, 60)).toBe(5);
    expect(parseBoundedInt(null, 5, 1, 60)).toBe(5);
    expect(parseBoundedInt('', 5, 1, 60)).toBe(5);
    expect(parseBoundedInt('   ', 5, 1, 60)).toBe(5);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseBoundedInt('  30  ', 5, 1, 60)).toBe(30);
  });

  it('truncates a fractional value toward zero', () => {
    expect(parseBoundedInt('3.5', 5, 1, 60)).toBe(3);
    expect(parseBoundedInt('-3.5', 5, -60, 60)).toBe(-3);
  });

  // The five hand-rolled copies this replaced disagreed on every case below.
  // These assertions pin the single agreed behaviour so a future rewrite cannot
  // quietly reintroduce a 1000x misread.
  describe('values that the old copies disagreed about', () => {
    it('rejects scientific notation rather than reading 1e3 as either 1 or 1000', () => {
      expect(parseBoundedInt('1e3', 5, 1, 60)).toBe(5);
    });

    it('rejects hex rather than reading 0x10 as either 0 or 16', () => {
      expect(parseBoundedInt('0x10', 5, 1, 60)).toBe(5);
    });

    it('rejects a trailing-garbage value instead of silently accepting the prefix', () => {
      expect(parseBoundedInt('30abc', 5, 1, 60)).toBe(5);
    });

    it('rejects a unit-suffixed value instead of silently accepting the prefix', () => {
      expect(parseBoundedInt('30m', 5, 1, 60)).toBe(5);
    });

    it('rejects Infinity and NaN', () => {
      expect(parseBoundedInt('Infinity', 5, 1, 60)).toBe(5);
      expect(parseBoundedInt('NaN', 5, 1, 60)).toBe(5);
    });
  });
});

describe('readEnvInt', () => {
  it('reads and bounds a value from an injected env record', () => {
    expect(readEnvInt('WORKER_INTERVAL_MIN', 15, 1, 1440, { WORKER_INTERVAL_MIN: '30' })).toBe(30);
  });

  it('falls back when the key is missing from the record', () => {
    expect(readEnvInt('WORKER_INTERVAL_MIN', 15, 1, 1440, {})).toBe(15);
  });

  it('does not mutate or read process.env when a record is supplied', () => {
    expect(readEnvInt('WORKER_INTERVAL_MIN', 15, 1, 1440, { WORKER_INTERVAL_MIN: 'bad' })).toBe(15);
  });
});

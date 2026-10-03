import { describe, expect, it } from 'vitest';
import { assertSafeOutboundUrl, isBlockedHostname } from '../safe-url';

describe('assertSafeOutboundUrl', () => {
  it('allows public HTTPS', () => {
    const url = assertSafeOutboundUrl('https://api.openai.com/v1');
    expect(url.hostname).toBe('api.openai.com');
  });

  it('allows localhost HTTP for Ollama', () => {
    expect(assertSafeOutboundUrl('http://127.0.0.1:11434/v1').hostname).toBe('127.0.0.1');
  });

  it('rejects remote HTTP', () => {
    expect(() => assertSafeOutboundUrl('http://api.example.com')).toThrow(/HTTPS/);
  });

  it('rejects private IPv4 and metadata', () => {
    expect(() => assertSafeOutboundUrl('https://169.254.169.254/latest')).toThrow(/not allowed/);
    expect(() => assertSafeOutboundUrl('https://10.0.0.5/')).toThrow(/not allowed/);
    expect(() => assertSafeOutboundUrl('https://192.168.1.1/')).toThrow(/not allowed/);
    expect(() => assertSafeOutboundUrl('https://172.16.0.1/')).toThrow(/not allowed/);
  });

  it('rejects credentials in URL', () => {
    expect(() => assertSafeOutboundUrl('https://user:pass@api.example.com')).toThrow(/credentials/);
  });
});

describe('isBlockedHostname', () => {
  it('flags RFC1918 and link-local', () => {
    expect(isBlockedHostname('10.1.2.3')).toBe(true);
    expect(isBlockedHostname('169.254.169.254')).toBe(true);
    expect(isBlockedHostname('metadata.google.internal')).toBe(true);
    expect(isBlockedHostname('api.openai.com')).toBe(false);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/adapters/ai/ai-client', () => ({
  sendServerStreamingChatCompletion: vi.fn(),
  AiClientError: class extends Error {},
}));

vi.mock('@/lib/adapters/ai/ai-prompt-builder', () => ({
  buildSystemPrompt: vi.fn(() => 'system'),
  buildUserMessage: vi.fn((c: string) => c),
}));

import { useAiStore } from '../use-ai-store';

describe('useAiStore', () => {
  beforeEach(() => {
    useAiStore.setState({
      config: { baseUrl: '', apiKey: '', model: '' },
      isConfigured: false,
      hydrated: false,
      serverManaged: false,
      rememberKey: false,
      messages: [],
      isStreaming: false,
      error: null,
      technicalContext: null,
    });
  });

  describe('updateConfig', () => {
    it('sets isConfigured when all three fields present', () => {
      useAiStore.getState().updateConfig({
        baseUrl: 'https://api.example.com',
        apiKey: 'key123',
        model: 'gpt-4',
      });
      expect(useAiStore.getState().isConfigured).toBe(true);
    });

    it('sets isConfigured false when any field missing', () => {
      useAiStore.getState().updateConfig({
        baseUrl: 'https://api.example.com',
        apiKey: '',
        model: 'gpt-4',
      });
      expect(useAiStore.getState().isConfigured).toBe(false);
    });

    it('sets serverManaged false on manual config', () => {
      useAiStore.setState({ serverManaged: true });
      useAiStore.getState().updateConfig({ apiKey: 'key' });
      expect(useAiStore.getState().serverManaged).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('is no-op when not configured', () => {
      useAiStore.getState().sendMessage('hello');
      expect(useAiStore.getState().messages).toHaveLength(0);
    });

    it('is no-op when already streaming', () => {
      useAiStore.setState({
        isConfigured: true,
        isStreaming: true,
      });
      useAiStore.getState().sendMessage('hello');
      expect(useAiStore.getState().messages).toHaveLength(0);
    });

    it('is no-op when within cooldown', () => {
      useAiStore.setState({
        isConfigured: true,
        messages: [
          { id: '1', role: 'user', content: 'hi', timestamp: Date.now() - 500 },
        ],
      });
      useAiStore.getState().sendMessage('hello');
      expect(useAiStore.getState().messages).toHaveLength(1);
    });

    it('adds user and assistant messages when allowed', () => {
      useAiStore.setState({
        isConfigured: true,
        messages: [],
      });
      useAiStore.getState().sendMessage('hello');
      const state = useAiStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0]!.role).toBe('user');
      expect(state.messages[1]!.role).toBe('assistant');
      expect(state.isStreaming).toBe(true);
    });
  });

  describe('stopStreaming', () => {
    it('clears streaming state', () => {
      useAiStore.setState({ isStreaming: true });
      useAiStore.getState().stopStreaming();
      expect(useAiStore.getState().isStreaming).toBe(false);
    });
  });

  describe('clearHistory', () => {
    it('empties messages and clears error', () => {
      useAiStore.setState({
        messages: [
          { id: '1', role: 'user', content: 'hi', timestamp: 1000 },
        ],
        isStreaming: true,
        error: 'something',
      });
      useAiStore.getState().clearHistory();
      const state = useAiStore.getState();
      expect(state.messages).toEqual([]);
      expect(state.isStreaming).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('clearError', () => {
    it('clears error', () => {
      useAiStore.setState({ error: 'bad' });
      useAiStore.getState().clearError();
      expect(useAiStore.getState().error).toBeNull();
    });
  });

  describe('setRememberKey', () => {
    it('sets rememberKey flag', () => {
      useAiStore.getState().setRememberKey(true);
      expect(useAiStore.getState().rememberKey).toBe(true);
    });
  });

  describe('setTechnicalContext', () => {
    it('sets context', () => {
      const ctx = { symbol: 'BTC', timeframe: '4H' } as never;
      useAiStore.getState().setTechnicalContext(ctx);
      expect(useAiStore.getState().technicalContext).toBe(ctx);
    });
  });
});

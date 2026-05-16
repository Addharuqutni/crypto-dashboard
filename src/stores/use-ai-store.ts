/**
 * AI Agent Zustand store — manages configuration, conversation history, and streaming state.
 * Config is persisted to localStorage so users don't need to re-enter credentials.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AiConfig, AiMessage, TechnicalContext } from '@/types/ai';
import { sendStreamingChatCompletion, AiClientError } from '@/lib/ai/ai-client';
import { buildSystemPrompt, buildUserMessage } from '@/lib/ai/ai-prompt-builder';

/** Module-level abort controller — kept outside store to avoid non-serializable state */
let activeController: AbortController | null = null;

/** Minimum interval between messages to prevent API credit burn (ms) */
const MESSAGE_COOLDOWN_MS = 2000;

interface AiState {
  // Configuration
  config: AiConfig;
  isConfigured: boolean;
  hydrated: boolean;

  // Conversation
  messages: AiMessage[];
  isStreaming: boolean;
  error: string | null;

  // Current technical context (not persisted)
  technicalContext: TechnicalContext | null;

  // Actions
  updateConfig: (config: Partial<AiConfig>) => void;
  setTechnicalContext: (context: TechnicalContext | null) => void;
  sendMessage: (content: string) => void;
  stopStreaming: () => void;
  clearHistory: () => void;
  clearError: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useAiStore = create<AiState>()(
  persist(
    (set, get) => ({
      // Initial state
      config: { baseUrl: '', apiKey: '', model: '' },
      isConfigured: false,
      hydrated: false,
      messages: [],
      isStreaming: false,
      error: null,
      technicalContext: null,

      updateConfig: (partial) => {
        const current = get().config;
        const updated = { ...current, ...partial };
        const isConfigured = Boolean(updated.baseUrl && updated.apiKey && updated.model);
        set({ config: updated, isConfigured });
      },

      setTechnicalContext: (context) => {
        set({ technicalContext: context });
      },

      sendMessage: (content) => {
        const state = get();
        if (!state.isConfigured || state.isStreaming) return;

        // Rate limiting: prevent rapid-fire messages
        const lastUserMsg = [...state.messages].reverse().find((m) => m.role === 'user');
        if (lastUserMsg && Date.now() - lastUserMsg.timestamp < MESSAGE_COOLDOWN_MS) return;

        const userMessage: AiMessage = {
          id: generateId(),
          role: 'user',
          content: buildUserMessage(content),
          timestamp: Date.now(),
        };

        const assistantMessage: AiMessage = {
          id: generateId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };

        set((s) => ({
          messages: [...s.messages, userMessage, assistantMessage],
          isStreaming: true,
          error: null,
        }));

        // Build messages array for API
        const systemPrompt = state.technicalContext
          ? buildSystemPrompt(state.technicalContext)
          : buildSystemPrompt({
              symbol: 'UNKNOWN',
              timeframe: 'N/A',
            });

        // Include recent conversation history, filter out empty messages
        const recentMessages = [...state.messages, userMessage]
          .filter((m) => m.content.trim() !== '')
          .slice(-10);

        const apiMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
        ];

        const controller = sendStreamingChatCompletion(
          state.config,
          apiMessages,
          {
            onChunk: (chunk) => {
              set((s) => {
                const msgs = [...s.messages];
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + chunk };
                }
                return { messages: msgs };
              });
            },
            onDone: () => {
              activeController = null;
              set({ isStreaming: false });
            },
            onError: (error: AiClientError) => {
              activeController = null;
              set((s) => {
                // Remove empty assistant message on error
                const msgs = [...s.messages];
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
                  msgs.pop();
                }
                return {
                  messages: msgs,
                  isStreaming: false,
                  error: error.message,
                };
              });
            },
          }
        );

        activeController = controller;
      },

      stopStreaming: () => {
        if (activeController) {
          activeController.abort();
          activeController = null;
          set({ isStreaming: false });
        }
      },

      clearHistory: () => {
        if (activeController) {
          activeController.abort();
          activeController = null;
        }
        set({ messages: [], isStreaming: false, error: null });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'crypto-ai-config',
      // Only persist config and messages, not runtime state
      partialize: (state) => ({
        config: state.config,
        isConfigured: state.isConfigured,
        messages: state.messages.slice(-50), // Keep last 50 messages
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
        }
      },
    }
  )
);

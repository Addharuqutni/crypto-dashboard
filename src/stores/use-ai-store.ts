/**
 * AI Agent Zustand store — manages configuration, conversation history, and streaming state.
 * Config is persisted to localStorage so users don't need to re-enter credentials.
 *
 * Security note: when `rememberKey` is true the API key is written to
 * localStorage. localStorage is readable by any script running on the same
 * origin, so an XSS bug (e.g. a compromised dependency rendering untrusted
 * HTML) could exfiltrate the key. The default is therefore `false` — users
 * must opt in explicitly to persist the key across sessions.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AiConfig, AiMessage, TechnicalContext } from '@/types/ai';
import { sendStreamingChatCompletion, AiClientError } from '@/lib/adapters/ai/ai-client';
import { buildSystemPrompt, buildUserMessage } from '@/lib/adapters/ai/ai-prompt-builder';

/**
 * Module-level handles for the in-flight streaming request. Kept outside
 * the store because both values are non-serializable and must survive any
 * persisted-state rehydration.
 *
 * `activeRequestId` is paired with the controller so late-arriving callbacks
 * (chunks, done, error) from a cancelled or replaced request can be ignored
 * instead of mutating the wrong assistant message.
 */
let activeController: AbortController | null = null;
let activeRequestId: string | null = null;

/** Minimum interval between messages to prevent API credit burn (ms) */
const MESSAGE_COOLDOWN_MS = 2000;

interface AiState {
  // Configuration
  config: AiConfig;
  isConfigured: boolean;
  hydrated: boolean;
  /**
   * Whether to persist the API key to localStorage.
   *
   * Defaults to `false` for new users so the key only lives in memory
   * (safer default, follows "principle of least privilege"). When `true`,
   * the key is written to localStorage and survives reloads.
   */
  rememberKey: boolean;

  // Conversation
  messages: AiMessage[];
  isStreaming: boolean;
  error: string | null;

  // Current technical context (not persisted)
  technicalContext: TechnicalContext | null;

  // Actions
  updateConfig: (config: Partial<AiConfig>) => void;
  setRememberKey: (remember: boolean) => void;
  setTechnicalContext: (context: TechnicalContext | null) => void;
  sendMessage: (content: string) => void;
  stopStreaming: () => void;
  clearHistory: () => void;
  clearError: () => void;
}

/** Generate a stable, locally-unique id for messages and request tags. */
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
      rememberKey: false,
      messages: [],
      isStreaming: false,
      error: null,
      technicalContext: null,

      /**
       * Merge config updates and recompute `isConfigured` so UI state can react
       * without recomputing the boolean in every consumer.
       */
      updateConfig: (partial) => {
        const current = get().config;
        const updated = { ...current, ...partial };
        const isConfigured = Boolean(updated.baseUrl && updated.apiKey && updated.model);
        set({ config: updated, isConfigured });
      },

      /** Toggle whether the API key persists across reloads. */
      setRememberKey: (remember) => {
        set({ rememberKey: remember });
      },

      /** Replace the technical context used to seed the system prompt. */
      setTechnicalContext: (context) => {
        set({ technicalContext: context });
      },

      /**
       * Start a new streaming chat completion. Aborts any in-flight request
       * and tags the new request with a unique id so late callbacks from the
       * previous request can be detected and dropped.
       */
      sendMessage: (content) => {
        const state = get();
        if (!state.isConfigured || state.isStreaming) return;

        // Rate limiting: prevent rapid-fire messages.
        const lastUserMsg = [...state.messages].reverse().find((m) => m.role === 'user');
        if (lastUserMsg && Date.now() - lastUserMsg.timestamp < MESSAGE_COOLDOWN_MS) return;

        // Abort any leftover request before starting a new one.
        if (activeController) {
          activeController.abort();
          activeController = null;
        }

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

        const requestId = generateId();
        activeRequestId = requestId;

        set((s) => ({
          messages: [...s.messages, userMessage, assistantMessage],
          isStreaming: true,
          error: null,
        }));

        const systemPrompt = state.technicalContext
          ? buildSystemPrompt(state.technicalContext)
          : buildSystemPrompt({ symbol: 'UNKNOWN', timeframe: 'N/A' });

        // Include recent conversation history, filter out empty messages.
        const recentMessages = [...state.messages, userMessage]
          .filter((m) => m.content.trim() !== '')
          .slice(-10);

        const apiMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
        ];

        const assistantId = assistantMessage.id;

        const controller = sendStreamingChatCompletion(
          state.config,
          apiMessages,
          {
            /**
             * Append a streamed chunk to the specific assistant message tied to
             * this request. Stale chunks from cancelled requests are ignored.
             */
            onChunk: (chunk) => {
              if (activeRequestId !== requestId) return;
              set((s) => {
                const idx = s.messages.findIndex((m) => m.id === assistantId);
                if (idx === -1) return {};
                const target = s.messages[idx];
                if (!target || target.role !== 'assistant') return {};
                const msgs = s.messages.slice();
                msgs[idx] = { ...target, content: target.content + chunk };
                return { messages: msgs };
              });
            },
            /**
             * Mark streaming finished only when the active request matches.
             * Late `onDone` callbacks from previously cancelled requests are
             * dropped so they cannot reset UI state.
             */
            onDone: () => {
              if (activeRequestId !== requestId) return;
              activeController = null;
              activeRequestId = null;
              set({ isStreaming: false });
            },
            /**
             * Surface errors only for the active request. Aborts already
             * skip this path inside the client, but late errors from a
             * stale request must not leak into the visible state either.
             */
            onError: (error: AiClientError) => {
              if (activeRequestId !== requestId) return;
              activeController = null;
              activeRequestId = null;
              set((s) => {
                const idx = s.messages.findIndex((m) => m.id === assistantId);
                const msgs = s.messages.slice();
                if (idx !== -1 && msgs[idx]?.content === '') msgs.splice(idx, 1);
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

      /** Cancel the active stream and clear streaming state. */
      stopStreaming: () => {
        if (activeController) {
          activeController.abort();
        }
        activeController = null;
        activeRequestId = null;
        set({ isStreaming: false });
      },

      /** Clear conversation history and abort any in-flight request. */
      clearHistory: () => {
        if (activeController) {
          activeController.abort();
        }
        activeController = null;
        activeRequestId = null;
        set({ messages: [], isStreaming: false, error: null });
      },

      /** Clear the visible error banner. */
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'crypto-ai-config',
      // Persist baseUrl, model, message history, and remember-key preference.
      // The API key is only included when the user has opted in via
      // `rememberKey`. Otherwise it stays in-memory and disappears on reload,
      // which is the safer default for credentials in localStorage.
      partialize: (state) => ({
        config: state.rememberKey
          ? state.config
          : { ...state.config, apiKey: '' },
        isConfigured: state.rememberKey ? state.isConfigured : false,
        rememberKey: state.rememberKey,
        messages: state.messages.slice(-50), // Keep last 50 messages
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
          // Backwards compatibility: pre-rememberKey storage shapes had a
          // populated apiKey but no flag. If we find a non-empty key on
          // rehydrate, treat it as if the user had previously opted in so
          // their session is not unexpectedly broken.
          if (state.config.apiKey && !state.rememberKey) {
            state.rememberKey = true;
          }
        }
      },
    }
  )
);

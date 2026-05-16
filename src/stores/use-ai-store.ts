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

/**

 * Membuat id berdasarkan input saat ini.

 * Dipakai agar proses pembentukan data tetap konsisten di satu tempat.

 */

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

       * Memperbarui data config yang sudah tersimpan.

       * Dipakai agar mutation state tetap konsisten dan tidak tersebar di komponen.

       */

      updateConfig: (partial) => {
        const current = get().config;
        const updated = { ...current, ...partial };
        const isConfigured = Boolean(updated.baseUrl && updated.apiKey && updated.model);
        set({ config: updated, isConfigured });
      },

      /**

       * Mengubah nilai remember key pada state aplikasi.

       * Dipakai agar perubahan state tetap melalui satu jalur yang mudah dilacak.

       */

      setRememberKey: (remember) => {
        set({ rememberKey: remember });
      },

      /**

       * Mengubah nilai technical context pada state aplikasi.

       * Dipakai agar perubahan state tetap melalui satu jalur yang mudah dilacak.

       */

      setTechnicalContext: (context) => {
        set({ technicalContext: context });
      },

      /**

       * Menjalankan logic send message.

       * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

       */

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
            /**
             * Menangani event chunk dari interaksi pengguna atau browser.
             * Dipakai agar side effect dari event tetap jelas dan terlokalisasi.
             */
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
            /**
             * Menangani event done dari interaksi pengguna atau browser.
             * Dipakai agar side effect dari event tetap jelas dan terlokalisasi.
             */
            onDone: () => {
              activeController = null;
              set({ isStreaming: false });
            },
            /**
             * Menangani event error dari interaksi pengguna atau browser.
             * Dipakai agar side effect dari event tetap jelas dan terlokalisasi.
             */
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

      /**

       * Menjalankan logic stop streaming.

       * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

       */

      stopStreaming: () => {
        if (activeController) {
          activeController.abort();
          activeController = null;
          set({ isStreaming: false });
        }
      },

      /**

       * Membersihkan data history dari state aplikasi.

       * Dipakai untuk reset data lokal secara eksplisit sesuai aksi pengguna.

       */

      clearHistory: () => {
        if (activeController) {
          activeController.abort();
          activeController = null;
        }
        set({ messages: [], isStreaming: false, error: null });
      },

      /**

       * Membersihkan data error dari state aplikasi.

       * Dipakai untuk reset data lokal secara eksplisit sesuai aksi pengguna.

       */

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


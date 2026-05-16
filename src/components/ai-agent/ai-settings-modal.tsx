'use client';

import { useState, useEffect } from 'react';
import { useAiStore } from '@/stores/use-ai-store';
import { testConnection } from '@/lib/ai/ai-client';
import { cn } from '@/lib/utils';
import { X, Loader2, CheckCircle2, XCircle, Settings2, Eye, EyeOff, ShieldAlert } from 'lucide-react';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal for configuring AI Agent connection settings.
 * User inputs Base URL, API Key, and Model name.
 * Supports testing the connection before saving.
 */
export function AiSettingsModal({ isOpen, onClose }: AiSettingsModalProps) {
  const config = useAiStore((s) => s.config);
  const updateConfig = useAiStore((s) => s.updateConfig);
  const rememberKey = useAiStore((s) => s.rememberKey);
  const setRememberKey = useAiStore((s) => s.setRememberKey);

  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);
  const [showKey, setShowKey] = useState(false);
  const [remember, setRemember] = useState(rememberKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reset form state when modal opens to reflect current store config
  useEffect(() => {
    if (isOpen) {
      setBaseUrl(config.baseUrl);
      setApiKey(config.apiKey);
      setModel(config.model);
      setRemember(rememberKey);
      setTestResult(null);
      setShowKey(false);
    }
  }, [isOpen, config.baseUrl, config.apiKey, config.model, rememberKey]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    /**
     * Menjalankan logic handle esc.
     * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.
     */
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const canSave = baseUrl.trim() && apiKey.trim() && model.trim();

  /**

   * Menjalankan logic handle test.

   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

   */

  const handleTest = async () => {
    if (!canSave) return;
    setTesting(true);
    setTestResult(null);

    const result = await testConnection({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    setTestResult(result);
    setTesting(false);
  };

  /**

   * Menjalankan logic handle save.

   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

   */

  const handleSave = () => {
    setRememberKey(remember);
    updateConfig({
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md animate-in rounded-xl border border-border-subtle bg-bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Settings2 className="h-5 w-5 text-accent-secondary" />
            <h2 className="text-base font-semibold text-text-primary">AI Agent Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-5">
          <p className="text-xs leading-relaxed text-text-muted">
            Configure your AI provider. Supports any OpenAI-compatible API (OpenAI, Groq, Together AI, Ollama, etc).
          </p>

          {/* Base URL */}
          <div className="space-y-1.5">
            <label htmlFor="ai-base-url" className="text-xs font-medium text-text-secondary">
              Base URL
            </label>
            <input
              id="ai-base-url"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 transition-colors focus:border-accent-secondary focus:outline-none focus:ring-2 focus:ring-accent-secondary/20"
            />
            <p className="text-[10px] text-text-muted">
              Include /v1 if your provider requires it
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label htmlFor="ai-api-key" className="text-xs font-medium text-text-secondary">
              API Key
            </label>
            <div className="relative">
              <input
                id="ai-api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted/50 transition-colors focus:border-accent-secondary focus:outline-none focus:ring-2 focus:ring-accent-secondary/20"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-secondary"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Remember key toggle */}
            <label
              htmlFor="ai-remember-key"
              className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-border-subtle/60 bg-bg-surface-raised/40 px-2.5 py-2"
            >
              <input
                id="ai-remember-key"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent-secondary"
              />
              <span className="flex-1 text-[11px] leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">Remember key on this device</span>
                <span className="mt-0.5 flex items-start gap-1 text-text-muted">
                  <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden />
                  <span>
                    Stored unencrypted in localStorage. Any script on this origin
                    can read it. Leave off on shared computers.
                  </span>
                </span>
              </span>
            </label>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label htmlFor="ai-model" className="text-xs font-medium text-text-secondary">
              Model
            </label>
            <input
              id="ai-model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o"
              className="w-full rounded-lg border border-border-subtle bg-bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 transition-colors focus:border-accent-secondary focus:outline-none focus:ring-2 focus:ring-accent-secondary/20"
            />
            <p className="text-[10px] text-text-muted">
              e.g. gpt-4o, gpt-3.5-turbo, llama-3.1-70b, mixtral-8x7b
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs',
                testResult.success
                  ? 'border border-success/20 bg-success/5 text-success'
                  : 'border border-danger/20 bg-danger/5 text-danger'
              )}
            >
              {testResult.success ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span className="leading-relaxed">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border-subtle px-5 py-4">
          <button
            onClick={handleTest}
            disabled={!canSave || testing}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              canSave && !testing
                ? 'bg-bg-surface-raised text-text-secondary hover:bg-bg-surface-soft hover:text-text-primary'
                : 'cursor-not-allowed bg-bg-surface-raised/50 text-text-muted/50'
            )}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Test Connection
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={cn(
                'rounded-lg px-4 py-2 text-xs font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                canSave
                  ? 'bg-accent-secondary text-white hover:bg-accent-secondary/90'
                  : 'cursor-not-allowed bg-accent-secondary/30 text-white/50'
              )}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

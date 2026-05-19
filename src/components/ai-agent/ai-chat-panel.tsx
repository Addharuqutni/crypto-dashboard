'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useAiStore } from '@/stores/use-ai-store';
import { AiMessageBubble } from './ai-message-bubble';
import { AiContextBadge } from './ai-context-badge';
import { AiSettingsModal } from './ai-settings-modal';
import { cn } from '@/lib/shared/utils';
import type { AnalysisResult } from '@/types/chart';
import type { TechnicalContext } from '@/types/ai';
import {
  Bot,
  Send,
  Settings2,
  Trash2,
  ChevronDown,
  StopCircle,
  AlertTriangle,
  Sparkles,
  X,
} from 'lucide-react';

interface AiChatPanelProps {
  symbol: string;
  timeframe: string;
  currentPrice?: number;
  /** Pre-computed analysis from parent — avoids duplicate indicator calculation */
  analysis: AnalysisResult | null;
}

/**
 * AI Chat Panel — collapsible panel for interacting with the AI technical analyst.
 * Receives pre-computed technical analysis from parent.
 * Appears in Technical Mode on the coin detail page.
 */
export function AiChatPanel({ symbol, timeframe, currentPrice, analysis }: AiChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messages = useAiStore((s) => s.messages);
  const isStreaming = useAiStore((s) => s.isStreaming);
  const isConfigured = useAiStore((s) => s.isConfigured);
  const hydrated = useAiStore((s) => s.hydrated);
  const error = useAiStore((s) => s.error);
  const sendMessage = useAiStore((s) => s.sendMessage);
  const stopStreaming = useAiStore((s) => s.stopStreaming);
  const clearHistory = useAiStore((s) => s.clearHistory);
  const clearError = useAiStore((s) => s.clearError);
  const setTechnicalContext = useAiStore((s) => s.setTechnicalContext);

  // Build technical context from pre-computed analysis
  const technicalContext: TechnicalContext | null = useMemo(() => {
    if (!analysis) return null;

    return {
      symbol,
      timeframe,
      price: currentPrice,
      rsi: analysis.rsi.value ? { value: analysis.rsi.value, status: analysis.rsi.status } : undefined,
      macd: analysis.macd ? { macd: analysis.macd.macd, signal: analysis.macd.signal, histogram: analysis.macd.histogram } : undefined,
      trend: { value: analysis.trend.value, reasons: analysis.trend.reasons },
      supportResistance: { support: analysis.sr.support ?? null, resistance: analysis.sr.resistance ?? null, confidence: analysis.sr.confidence },
      fibonacci: analysis.fib ? { direction: analysis.fib.direction, levels: analysis.fib.levels.map((l) => ({ label: l.label, price: l.price })) } : undefined,
      orderBlocks: analysis.orderBlocks.slice(-3).map((ob) => ({ type: ob.type, high: ob.high, low: ob.low, strength: ob.strength })),
    };
  }, [analysis, symbol, timeframe, currentPrice]);

  // Sync technical context to store
  useEffect(() => {
    setTechnicalContext(technicalContext);
  }, [technicalContext, setTechnicalContext]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**

   * Menjalankan logic handle send.

   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

   */

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput('');
    inputRef.current?.focus();
  };

  /**

   * Menjalankan logic handle key down.

   * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

   */

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick prompts for empty state
  const quickPrompts = [
    'Analisis teknikal singkat untuk kondisi saat ini',
    'Apakah saat ini waktu yang tepat untuk entry?',
    'Berikan level support dan resistance kunci',
    'Apa sinyal dari RSI dan MACD saat ini?',
  ];

  if (!hydrated) return null;

  return (
    <>
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="pressable flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-md"
            aria-expanded={!collapsed}
          >
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg bg-accent-secondary/10 transition-transform duration-300',
                'will-change-transform',
                !collapsed && 'shadow-[0_0_0_3px_rgba(139,92,246,0.08)]'
              )}
            >
              <Bot className="h-[18px] w-[18px] text-accent-secondary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">AI Technical Advisor</h3>
              <p className="text-[10px] text-text-muted">
                {isConfigured ? 'Powered by your configured LLM' : 'Not configured'}
              </p>
            </div>
            {/*
              Single chevron whose rotation expresses state. Cheaper than
              swapping icons and reads as a smooth gesture rather than a swap.
            */}
            <ChevronDown
              className={cn(
                'ml-2 h-4 w-4 text-text-muted transition-transform duration-300',
                collapsed ? 'rotate-0' : '-rotate-180'
              )}
              aria-hidden
            />
          </button>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="pressable rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-label="Clear chat history"
                title="Clear history"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              className={cn(
                'pressable rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                isConfigured
                  ? 'text-text-muted hover:bg-bg-surface-raised hover:text-text-secondary'
                  : 'text-accent-warm hover:bg-accent-warm/10 animate-soft-pulse'
              )}
              aria-label="AI settings"
              title="Settings"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/*
          Body — uses the `collapsible` grid utility so the height transitions
          from 0fr to 1fr without measuring the inner element. Keeps the panel
          mounted so chat state and refs survive across collapses.
        */}
        <div className="collapsible" data-open={!collapsed} aria-hidden={collapsed}>
          <div className="flex flex-col">
            {/* Not configured state */}
            {!isConfigured && (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <div className="animate-soft-pulse flex h-12 w-12 items-center justify-center rounded-full bg-accent-secondary/10">
                  <Sparkles className="h-6 w-6 text-accent-secondary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Configure AI Agent</p>
                  <p className="mt-1 text-xs text-text-muted leading-relaxed">
                    Set up your AI provider to get intelligent technical analysis advice based on real-time market data.
                  </p>
                </div>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="pressable inline-flex items-center gap-1.5 rounded-lg bg-accent-secondary px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_-8px_rgba(139,92,246,0.6)] transition-all hover:bg-accent-secondary/90 hover:shadow-[0_10px_28px_-6px_rgba(139,92,246,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Setup Now
                </button>
              </div>
            )}

            {/* Configured — chat interface */}
            {isConfigured && (
              <>
                {/* Context Badge */}
                <div className="px-3 pt-3">
                  <AiContextBadge context={technicalContext} />
                </div>

                {/* Crypto + Kronos skill notice — clarifies the AI's role
                    boundary so users know the AI explains/audits and the
                    risk engine remains the final authority. */}
                <div
                  className="mx-3 mt-2 rounded-lg border border-accent-secondary/20 bg-accent-secondary/5 px-2.5 py-1.5 text-[10px] leading-tight text-text-muted"
                  role="note"
                  aria-label="AI Agent skill policy"
                >
                  <span className="font-semibold text-accent-secondary">
                    Skill: Crypto + Kronos
                  </span>
                  <span className="mx-1.5 text-text-muted/50">·</span>
                  Mode: Explain/Audit only
                  <span className="mx-1.5 text-text-muted/50">·</span>
                  Final authority: Risk Engine
                  <span className="mx-1.5 text-text-muted/50">·</span>
                  Kronos: Evidence only
                </div>

                {/* Messages */}
                <div className="max-h-[400px] min-h-[200px] overflow-y-auto px-3 py-3 space-y-3" aria-live="polite" aria-atomic="false">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <Bot className="h-8 w-8 text-accent-secondary/30" />
                      <p className="text-xs text-text-muted">
                        Ask me anything about the technical analysis for {symbol}
                      </p>
                      {/*
                        Quick prompts — staggered fade-in via inline delays so
                        the empty state assembles itself instead of popping in.
                        `interactive` lifts on hover, `pressable` adds tap feel.
                      */}
                      <div className="grid w-full max-w-sm grid-cols-1 gap-1.5">
                        {quickPrompts.map((prompt, idx) => (
                          <button
                            key={prompt}
                            onClick={() => {
                              setInput(prompt);
                              inputRef.current?.focus();
                            }}
                            style={{ animationDelay: `${idx * 60}ms` }}
                            className="interactive pressable animate-slide-up rounded-lg border border-border-subtle/50 bg-bg-surface-soft px-3 py-2 text-left text-[11px] text-text-secondary hover:border-accent-secondary/40 hover:bg-accent-secondary/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg, i) => (
                    <AiMessageBubble
                      key={msg.id}
                      message={msg}
                      isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
                    />
                  ))}

                  <div ref={messagesEndRef} />
                </div>

                {/* Error — slides up from below with spring entrance. */}
                {error && (
                  <div className="animate-slide-up mx-3 mb-2 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                    <div className="flex-1">
                      <p className="text-xs text-danger">{error}</p>
                    </div>
                    <button
                      onClick={clearError}
                      className="pressable shrink-0 rounded p-0.5 text-danger/60 transition-colors hover:text-danger"
                      aria-label="Dismiss error"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Input */}
                <div className="border-t border-border-subtle px-3 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={isStreaming ? 'AI is thinking...' : 'Ask about technical analysis...'}
                      disabled={isStreaming}
                      className="glow-on-focus flex-1 rounded-lg border border-border-subtle bg-bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 transition-all focus:border-accent-secondary focus:outline-none disabled:opacity-50"
                    />

                    {isStreaming ? (
                      <button
                        onClick={stopStreaming}
                        className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger transition-colors hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        aria-label="Stop generating"
                      >
                        <StopCircle className="h-4 w-4 animate-pulse" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className={cn(
                          'pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                          input.trim()
                            ? 'bg-accent-secondary text-white shadow-[0_6px_20px_-6px_rgba(139,92,246,0.6)] hover:bg-accent-secondary/90 hover:shadow-[0_8px_24px_-4px_rgba(139,92,246,0.7)]'
                            : 'cursor-not-allowed bg-bg-surface-raised text-text-muted/50'
                        )}
                        aria-label="Send message"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AiSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

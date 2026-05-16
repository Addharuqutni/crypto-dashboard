'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useAiStore } from '@/stores/use-ai-store';
import { AiMessageBubble } from './ai-message-bubble';
import { AiContextBadge } from './ai-context-badge';
import { AiSettingsModal } from './ai-settings-modal';
import { cn } from '@/lib/utils';
import type { AnalysisResult } from '@/types/chart';
import type { TechnicalContext } from '@/types/ai';
import {
  Bot,
  Send,
  Settings2,
  Trash2,
  ChevronDown,
  ChevronUp,
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

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput('');
    inputRef.current?.focus();
  };

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
            className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-md"
            aria-expanded={!collapsed}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-secondary/10">
              <Bot className="h-[18px] w-[18px] text-accent-secondary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">AI Technical Advisor</h3>
              <p className="text-[10px] text-text-muted">
                {isConfigured ? 'Powered by your configured LLM' : 'Not configured'}
              </p>
            </div>
            {collapsed ? (
              <ChevronDown className="ml-2 h-4 w-4 text-text-muted" />
            ) : (
              <ChevronUp className="ml-2 h-4 w-4 text-text-muted" />
            )}
          </button>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-label="Clear chat history"
                title="Clear history"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              className={cn(
                'rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                isConfigured
                  ? 'text-text-muted hover:bg-bg-surface-raised hover:text-text-secondary'
                  : 'text-accent-warm hover:bg-accent-warm/10'
              )}
              aria-label="AI settings"
              title="Settings"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body — collapsible */}
        {!collapsed && (
          <div className="flex flex-col">
            {/* Not configured state */}
            {!isConfigured && (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-secondary/10">
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-secondary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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

                {/* Messages */}
                <div className="max-h-[400px] min-h-[200px] overflow-y-auto px-3 py-3 space-y-3" aria-live="polite" aria-atomic="false">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <Bot className="h-8 w-8 text-accent-secondary/30" />
                      <p className="text-xs text-text-muted">
                        Ask me anything about the technical analysis for {symbol}
                      </p>
                      {/* Quick prompts */}
                      <div className="grid grid-cols-1 gap-1.5 w-full max-w-sm">
                        {quickPrompts.map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => {
                              setInput(prompt);
                              inputRef.current?.focus();
                            }}
                            className="rounded-lg border border-border-subtle/50 bg-bg-surface-soft px-3 py-2 text-left text-[11px] text-text-secondary transition-colors hover:border-accent-secondary/30 hover:bg-accent-secondary/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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

                {/* Error */}
                {error && (
                  <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                    <div className="flex-1">
                      <p className="text-xs text-danger">{error}</p>
                    </div>
                    <button
                      onClick={clearError}
                      className="shrink-0 rounded p-0.5 text-danger/60 hover:text-danger"
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
                      className="flex-1 rounded-lg border border-border-subtle bg-bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 transition-colors focus:border-accent-secondary focus:outline-none focus:ring-2 focus:ring-accent-secondary/20 disabled:opacity-50"
                    />

                    {isStreaming ? (
                      <button
                        onClick={stopStreaming}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger transition-colors hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        aria-label="Stop generating"
                      >
                        <StopCircle className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                          input.trim()
                            ? 'bg-accent-secondary text-white hover:bg-accent-secondary/90'
                            : 'bg-bg-surface-raised text-text-muted/50 cursor-not-allowed'
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
        )}
      </div>

      {/* Settings Modal */}
      <AiSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

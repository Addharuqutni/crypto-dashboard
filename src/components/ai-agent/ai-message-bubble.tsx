'use client';

import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import type { AiMessage } from '@/types/ai';

interface AiMessageBubbleProps {
  message: AiMessage;
  isStreaming?: boolean;
}

/**
 * Individual chat message bubble.
 * Renders user messages right-aligned and AI responses left-aligned.
 * Supports basic markdown-like formatting in AI responses.
 */
export function AiMessageBubble({ message, isStreaming }: AiMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-2.5 animate-fade-in',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-accent-primary/10 text-accent-primary'
            : 'bg-accent-secondary/10 text-accent-secondary'
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3.5 py-2.5',
          isUser
            ? 'bg-accent-primary/10 text-text-primary'
            : 'bg-bg-surface-raised text-text-secondary'
        )}
      >
        {message.content ? (
          <div className="ai-message-content text-sm leading-relaxed">
            <FormattedContent content={message.content} />
          </div>
        ) : isStreaming ? (
          <TypingIndicator />
        ) : null}

        {/* Timestamp */}
        <p className={cn(
          'mt-1.5 text-[10px]',
          isUser ? 'text-accent-primary/50 text-right' : 'text-text-muted/50'
        )}>
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

/**
 * Typing indicator — animated dots shown while AI is generating.
 */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-secondary/60 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-secondary/60 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-secondary/60 [animation-delay:300ms]" />
    </div>
  );
}

/**
 * Basic markdown-like formatting for AI responses.
 * Handles bold, code blocks, bullet points, and line breaks.
 */
function FormattedContent({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <>
      {lines.map((line, i) => {
        // Empty line = paragraph break
        if (line.trim() === '') {
          return <br key={i} />;
        }

        // Bullet points
        if (line.match(/^[\s]*[-•*]\s/)) {
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-secondary/40" />
              <span>{formatInline(line.replace(/^[\s]*[-•*]\s/, ''))}</span>
            </div>
          );
        }

        // Numbered list
        if (line.match(/^[\s]*\d+[.)]\s/)) {
          const match = line.match(/^[\s]*(\d+[.)])\s(.*)$/);
          if (match) {
            return (
              <div key={i} className="flex gap-1.5 pl-1">
                <span className="shrink-0 text-accent-secondary/60 text-xs font-medium">{match[1]}</span>
                <span>{formatInline(match[2] ?? '')}</span>
              </div>
            );
          }
        }

        // Headers (## or ###)
        if (line.match(/^#{1,3}\s/)) {
          const text = line.replace(/^#{1,3}\s/, '');
          return (
            <p key={i} className="mt-2 mb-1 text-xs font-bold uppercase tracking-wider text-text-primary">
              {text}
            </p>
          );
        }

        // Code block markers
        if (line.trim().startsWith('```')) {
          return null;
        }

        // Regular line
        return (
          <p key={i} className="mb-0.5">
            {formatInline(line)}
          </p>
        );
      })}
    </>
  );
}

/**
 * Formats inline markdown: **bold**, `code`, *italic*
 */
function formatInline(text: string): React.ReactNode {
  // Split by bold, code, and italic patterns
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-bg-surface-soft px-1 py-0.5 text-[11px] font-mono text-accent-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      return (
        <em key={i} className="italic text-text-secondary">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

/**

 * Memformat nilai menjadi bentuk time yang siap ditampilkan.

 * Dipakai agar aturan tampilan angka/teks konsisten di seluruh UI.

 */

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

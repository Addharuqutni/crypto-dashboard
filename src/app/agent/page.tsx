import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import { AgentClient } from '@/components/agent/agent-client';

export const metadata: Metadata = {
  title: 'AI Agent · CryptoHawk',
  description: 'Read-only AI Signal Agent summaries from the latest futures screener snapshot.',
};

export default function AgentPage() {
  return (
    <AppShell>
      <AgentClient />
    </AppShell>
  );
}

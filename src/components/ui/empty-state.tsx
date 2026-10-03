import type { LucideIcon } from 'lucide-react';

/**
 * EmptyState — shared card for "nothing here yet" surfaces.
 * Replaces the icon + h2 + p + CTA block copy-pasted across pages.
 * Pass the CTA (Button or Link) as children.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <Icon className="empty-state-icon animate-soft-pulse" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-text-secondary">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

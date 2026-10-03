import { forwardRef } from 'react';
import { cn } from '@/lib/shared/utils';

type Variant = 'primary' | 'soft' | 'ghost' | 'danger-ghost';

const VARIANT_CLASSES: Record<Variant, string> = {
  /** Solid accent — main CTA (submit, confirm). */
  primary:
    'bg-accent-primary text-bg-app hover:bg-accent-primary/90 font-medium',
  /** Tinted accent — secondary CTA (Add, New, Explore). */
  soft: 'bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 font-medium',
  /** Neutral surface — cancel / dismiss. */
  ghost:
    'bg-bg-surface-raised text-text-secondary hover:bg-bg-surface-soft font-medium',
  /** Icon-only destructive affordance (trash buttons). */
  'danger-ghost': 'text-text-muted hover:bg-danger/10 hover:text-danger',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Renders a square icon button with a 44px tap target on touch. */
  icon?: boolean;
}

/**
 * Button — shared primitive replacing ~15 copy-pasted className stacks.
 * Focus ring + pressable feedback baked in. Compose extras via className.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'soft', icon = false, className, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'pressable inline-flex items-center justify-center gap-2 rounded-lg text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        icon ? 'tap-target h-11 w-11 md:h-8 md:w-8 md:min-h-0 md:min-w-0' : 'px-4 py-2',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
});

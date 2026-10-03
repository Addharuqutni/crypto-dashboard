'use client';

import { useEffect, useRef } from 'react';

/**
 * Elements that can receive keyboard focus. Excludes disabled controls and
 * anything explicitly removed from the tab order.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Modal focus management for overlays that are not native <dialog>.
 *
 * Native `<dialog>.showModal()` gives focus trapping, initial focus, and
 * Escape for free (see ConfirmDialog). Hand-rolled overlays — the screener
 * drawer, the AI settings modal — get none of that, so an `aria-modal="true"`
 * there is a promise the DOM does not keep: Tab walks into the page behind,
 * and focus starts at the top of the document.
 *
 * This hook restores the contract:
 *   - moves focus into the overlay on open (first focusable, else the panel),
 *   - cycles Tab / Shift+Tab within the overlay while it is open,
 *   - optionally closes on Escape,
 *   - returns focus to the previously focused element on close.
 *
 * @param active  Whether the overlay is open. Pass the same flag that gates
 *                rendering; the hook is safe to call unconditionally.
 * @param onEscape Optional Escape handler. Omit if the caller already handles
 *                Escape elsewhere to avoid a double close.
 * @returns A ref to attach to the overlay panel (the element that should
 *          contain focus — not the backdrop).
 */
export function useModalFocus<T extends HTMLElement>(
  active: boolean,
  onEscape?: () => void
) {
  const panelRef = useRef<T>(null);

  // Keep the latest callback in a ref so the effect can depend on `active`
  // alone. Callers pass inline arrows (`onClose={() => setOpen(false)}`), so
  // depending on the function identity directly would re-run the effect on
  // every render and yank focus back to the first element mid-interaction.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = (): HTMLElement[] =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        // getClientRects() is empty for display:none / detached nodes and,
        // unlike offsetParent, stays correct for position:fixed descendants.
        (el) => el.getClientRects().length > 0
      );

    const initial = focusable()[0] ?? panel;
    initial.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;

      if (event.shiftKey) {
        if (current === first || !panel.contains(current)) {
          event.preventDefault();
          last.focus();
        }
      } else if (current === last || !panel.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return panelRef;
}

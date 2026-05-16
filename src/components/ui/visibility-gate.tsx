'use client';

import { useEffect, useRef, useState } from 'react';

interface VisibilityGateProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
}

/**
 * Defers rendering expensive children until their container is near the viewport.
 * This is useful for chart panels because it avoids creating canvas/chart
 * instances while the panel is hidden below the fold or in a collapsed layout.
 */
export function VisibilityGate({
  children,
  fallback = null,
  rootMargin = '160px',
}: VisibilityGateProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);

  useEffect(() => {
    if (hasEnteredViewport) return;

    const container = containerRef.current;
    if (!container) return;

    if (!('IntersectionObserver' in window)) {
      setHasEnteredViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 }
    );

    observer.observe(container);

    return () => observer.disconnect();
  }, [hasEnteredViewport, rootMargin]);

  return <div ref={containerRef}>{hasEnteredViewport ? children : fallback}</div>;
}

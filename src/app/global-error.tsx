'use client';

/**
 * Root error boundary — only renders when the root layout itself throws, so
 * it must supply its own <html>/<body> and cannot rely on app tokens being
 * present. Inline styles keep it legible even if globals.css never loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: '#05070d',
          color: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div style={{ maxWidth: '26rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            CryptoHawk failed to load
          </h1>
          <p style={{ marginTop: '0.75rem', color: '#a7b0c0', fontSize: '0.875rem', lineHeight: 1.55 }}>
            A critical error prevented the app from starting. Reloading the page usually fixes it.
          </p>
          {error.digest && (
            <p style={{ marginTop: '0.75rem', color: '#7c8aa0', fontSize: '0.75rem' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.25rem',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#38bdf8',
              color: '#05070d',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}

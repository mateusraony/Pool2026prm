import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import App from './App';
import './index.css';

function GlobalErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div style={{ padding: '2rem', textAlign: 'center', background: '#0a0a1a', color: '#f87171', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Erro na aplicacao
        </h2>
        <p style={{ color: '#9ca3af', marginBottom: '1rem', fontSize: '0.875rem', maxWidth: '500px' }}>
          {message}
        </p>
        <button
          style={{ background: '#6366f1', color: '#fff', padding: '0.75rem 2rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
          onClick={() => { resetErrorBoundary(); window.location.reload(); }}
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}

function onGlobalError(error: unknown, info: { componentStack?: string | null }) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[CRASH]', message, info.componentStack);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary FallbackComponent={GlobalErrorFallback} onError={onGlobalError}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

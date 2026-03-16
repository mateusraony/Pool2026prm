import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import App from './App';
import { initWebVitals } from './lib/web-vitals';
import './index.css';

// Initialize Web Vitals monitoring (LCP, FID, CLS, TTFB, INP)
initWebVitals();

function GlobalErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div style={{ padding: '2rem', textAlign: 'center', background: '#0a0a1a', color: '#e5e7eb', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: '420px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#f87171' }}>
          Erro na aplicacao
        </h2>
        <p style={{ color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          {message}
        </p>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.75rem' }}>
          Se o problema persistir, tente limpar o cache do navegador ou acessar novamente.
        </p>
        <button
          style={{ background: '#6366f1', color: '#fff', padding: '0.75rem 2rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
          onClick={() => { resetErrorBoundary(); window.location.reload(); }}
        >
          Recarregar Aplicacao
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

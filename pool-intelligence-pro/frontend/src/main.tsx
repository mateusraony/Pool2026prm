import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import App from './App';
import './index.css';

// Global ErrorBoundary — catches ANY crash including Layout, Router, Providers
class GlobalErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CRASH]', error.message, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#0a0a1a', color: '#f87171', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Erro na aplicacao
            </h2>
            <p style={{ color: '#9ca3af', marginBottom: '1rem', fontSize: '0.875rem', maxWidth: '500px' }}>
              {this.state.error.message}
            </p>
            <button
              style={{ background: '#6366f1', color: '#fff', padding: '0.75rem 2rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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
    <GlobalErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ThemeProvider>
    </GlobalErrorBoundary>
  </React.StrictMode>
);

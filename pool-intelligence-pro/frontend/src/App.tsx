import { Component, ReactNode, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { RefreshCw } from 'lucide-react';

// Lazy-loaded pages — each becomes its own chunk
const PoolsPage = lazy(() => import('./pages/Pools'));
const PoolDetailPage = lazy(() => import('./pages/PoolDetail'));
const TokenAnalyzerPage = lazy(() => import('./pages/TokenAnalyzer'));
const RadarPage = lazy(() => import('./pages/Radar'));
const PositionsPage = lazy(() => import('./pages/Positions'));
const RecommendationsPage = lazy(() => import('./pages/Recommendations'));
const SimulationPage = lazy(() => import('./pages/Simulation'));
const WatchlistPage = lazy(() => import('./pages/Watchlist'));
const AlertsPage = lazy(() => import('./pages/Alerts'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const StatusPage = lazy(() => import('./pages/Status'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#f87171' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            Erro ao carregar a pagina
          </h2>
          <p style={{ color: '#9ca3af', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {this.state.error.message}
          </p>
          <button
            style={{ background: '#6366f1', color: '#fff', padding: '0.5rem 1.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}
            onClick={() => this.setState({ error: null })}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/pools" replace />} />
          <Route path="pools" element={<LazyPage><PoolsPage /></LazyPage>} />
          <Route path="pools/:chain/:address" element={<LazyPage><PoolDetailPage /></LazyPage>} />
          <Route path="token-analyzer" element={<LazyPage><TokenAnalyzerPage /></LazyPage>} />
          <Route path="radar" element={<LazyPage><RadarPage /></LazyPage>} />
          <Route path="positions" element={<LazyPage><PositionsPage /></LazyPage>} />
          <Route path="recommendations" element={<LazyPage><RecommendationsPage /></LazyPage>} />
          <Route path="simulation" element={<LazyPage><SimulationPage /></LazyPage>} />
          <Route path="simulation/:chain/:address" element={<LazyPage><SimulationPage /></LazyPage>} />
          <Route path="watchlist" element={<LazyPage><WatchlistPage /></LazyPage>} />
          <Route path="alerts" element={<LazyPage><AlertsPage /></LazyPage>} />
          <Route path="settings" element={<LazyPage><SettingsPage /></LazyPage>} />
          <Route path="status" element={<LazyPage><StatusPage /></LazyPage>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

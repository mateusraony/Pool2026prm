import { ReactNode, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import Layout from './components/layout/Layout';
import { Toaster } from './components/ui/sonner';

// Lazy-loaded pages for bundle splitting
const ScoutDashboard = lazy(() => import('./pages/ScoutDashboard'));
const ScoutRecommended = lazy(() => import('./pages/ScoutRecommended'));
const ScoutActivePools = lazy(() => import('./pages/ScoutActivePools'));
const ScoutPoolDetail = lazy(() => import('./pages/ScoutPoolDetail'));
const ScoutFavorites = lazy(() => import('./pages/ScoutFavorites'));
const ScoutHistory = lazy(() => import('./pages/ScoutHistory'));
const ScoutSettings = lazy(() => import('./pages/ScoutSettings'));
const PoolsPage = lazy(() => import('./pages/Pools'));
const TokenAnalyzerPage = lazy(() => import('./pages/TokenAnalyzer'));
const RadarPage = lazy(() => import('./pages/Radar'));
const SimulationPage = lazy(() => import('./pages/Simulation'));
const AlertsPage = lazy(() => import('./pages/Alerts'));
const StatusPage = lazy(() => import('./pages/Status'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
      <div style={{ textAlign: 'center', color: '#9ca3af' }}>
        <div style={{ width: '2rem', height: '2rem', border: '3px solid #4f46e5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 0.75rem' }} />
        <p style={{ fontSize: '0.875rem' }}>Carregando...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
}

function PageErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#f87171' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
        Erro ao carregar a pagina
      </h2>
      <p style={{ color: '#9ca3af', marginBottom: '1rem', fontSize: '0.875rem' }}>
        {message}
      </p>
      <button
        style={{ background: '#6366f1', color: '#fff', padding: '0.5rem 1.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}
        onClick={resetErrorBoundary}
      >
        Tentar novamente
      </button>
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={PageErrorFallback}>
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
          <Route index element={<Navigate to="/dashboard" replace />} />
          {/* Scout pages (primary navigation) */}
          <Route path="dashboard" element={<LazyPage><ScoutDashboard /></LazyPage>} />
          <Route path="recommended" element={<LazyPage><ScoutRecommended /></LazyPage>} />
          <Route path="active" element={<LazyPage><ScoutActivePools /></LazyPage>} />
          <Route path="favorites" element={<LazyPage><ScoutFavorites /></LazyPage>} />
          <Route path="history" element={<LazyPage><ScoutHistory /></LazyPage>} />
          <Route path="scout-settings" element={<LazyPage><ScoutSettings /></LazyPage>} />
          <Route path="pools/:chain/:address" element={<LazyPage><ScoutPoolDetail /></LazyPage>} />
          {/* Utility pages (unique functionality) */}
          <Route path="pools" element={<LazyPage><PoolsPage /></LazyPage>} />
          <Route path="token-analyzer" element={<LazyPage><TokenAnalyzerPage /></LazyPage>} />
          <Route path="radar" element={<LazyPage><RadarPage /></LazyPage>} />
          <Route path="simulation" element={<LazyPage><SimulationPage /></LazyPage>} />
          <Route path="simulation/:chain/:address" element={<LazyPage><SimulationPage /></LazyPage>} />
          <Route path="alerts" element={<LazyPage><AlertsPage /></LazyPage>} />
          <Route path="status" element={<LazyPage><StatusPage /></LazyPage>} />
          {/* Redirects: old routes → Scout equivalents */}
          <Route path="positions" element={<Navigate to="/active" replace />} />
          <Route path="watchlist" element={<Navigate to="/favorites" replace />} />
          <Route path="settings" element={<Navigate to="/scout-settings" replace />} />
          <Route path="recommendations" element={<Navigate to="/recommended" replace />} />
          {/* 404 fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

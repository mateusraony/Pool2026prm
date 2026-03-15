import { ReactNode, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import Layout from './components/layout/Layout';
import { Toaster } from './components/ui/sonner';
import { OnboardingWizard } from './components/common/OnboardingWizard';

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
const PoolComparePage = lazy(() => import('./pages/PoolCompare'));
const PoolAnalyticsPage = lazy(() => import('./pages/PoolAnalytics'));
const PortfolioPage = lazy(() => import('./pages/Portfolio'));

function PageLoader() {
  return (
    <div className="flex justify-center items-center min-h-[40vh]">
      <div className="text-center text-muted-foreground">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">Carregando...</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Conectando ao servidor</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
}

function PageErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  const isNetworkError = message.includes('Network') || message.includes('fetch') || message.includes('ECONNABORTED') || message.includes('timeout');
  return (
    <div className="p-8 text-center max-w-md mx-auto">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
        <span className="text-2xl">{isNetworkError ? '🔌' : '⚠️'}</span>
      </div>
      <h2 className="text-xl font-bold text-destructive mb-2">
        {isNetworkError ? 'Erro de conexao' : 'Erro ao carregar a pagina'}
      </h2>
      <p className="text-sm text-muted-foreground mb-1">
        {message}
      </p>
      {isNetworkError && (
        <p className="text-xs text-muted-foreground mb-4">
          O servidor pode estar inicializando. Aguarde alguns segundos e tente novamente.
        </p>
      )}
      <div className="flex gap-2 justify-center mt-4">
        <button
          className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={resetErrorBoundary}
        >
          Tentar novamente
        </button>
        <button
          className="bg-secondary text-secondary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={() => window.location.href = '/dashboard'}
        >
          Ir ao Dashboard
        </button>
      </div>
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
          <Route path="compare" element={<LazyPage><PoolComparePage /></LazyPage>} />
          <Route path="analytics/:chain/:address" element={<LazyPage><PoolAnalyticsPage /></LazyPage>} />
          <Route path="portfolio" element={<LazyPage><PortfolioPage /></LazyPage>} />
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
      <OnboardingWizard />
    </BrowserRouter>
  );
}

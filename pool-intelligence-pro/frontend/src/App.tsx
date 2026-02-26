import { Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { Toaster } from './components/ui/sonner';
import RadarPage from './pages/Radar';
import PositionsPage from './pages/Positions';
import RecommendationsPage from './pages/Recommendations';
import SimulationPage from './pages/Simulation';
import WatchlistPage from './pages/Watchlist';
import AlertsPage from './pages/Alerts';
import SettingsPage from './pages/Settings';
import StatusPage from './pages/Status';
import PoolsPage from './pages/Pools';
import PoolDetailPage from './pages/PoolDetail';
import TokenAnalyzerPage from './pages/TokenAnalyzer';
import ScoutDashboard from './pages/ScoutDashboard';
import ScoutRecommended from './pages/ScoutRecommended';
import ScoutActivePools from './pages/ScoutActivePools';
import ScoutPoolDetail from './pages/ScoutPoolDetail';
import ScoutFavorites from './pages/ScoutFavorites';
import ScoutHistory from './pages/ScoutHistory';
import ScoutSettings from './pages/ScoutSettings';

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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          {/* Scout pages */}
          <Route path="dashboard" element={<ErrorBoundary><ScoutDashboard /></ErrorBoundary>} />
          <Route path="recommended" element={<ErrorBoundary><ScoutRecommended /></ErrorBoundary>} />
          <Route path="active" element={<ErrorBoundary><ScoutActivePools /></ErrorBoundary>} />
          <Route path="favorites" element={<ErrorBoundary><ScoutFavorites /></ErrorBoundary>} />
          <Route path="history" element={<ErrorBoundary><ScoutHistory /></ErrorBoundary>} />
          <Route path="scout-settings" element={<ErrorBoundary><ScoutSettings /></ErrorBoundary>} />
          {/* Original pages */}
          <Route path="pools" element={<ErrorBoundary><PoolsPage /></ErrorBoundary>} />
          <Route path="pools/:chain/:address" element={<ErrorBoundary><ScoutPoolDetail /></ErrorBoundary>} />
          <Route path="token-analyzer" element={<ErrorBoundary><TokenAnalyzerPage /></ErrorBoundary>} />
          <Route path="radar" element={<ErrorBoundary><RadarPage /></ErrorBoundary>} />
          <Route path="positions" element={<ErrorBoundary><PositionsPage /></ErrorBoundary>} />
          <Route path="recommendations" element={<ErrorBoundary><RecommendationsPage /></ErrorBoundary>} />
          <Route path="simulation" element={<ErrorBoundary><SimulationPage /></ErrorBoundary>} />
          <Route path="simulation/:chain/:address" element={<ErrorBoundary><SimulationPage /></ErrorBoundary>} />
          <Route path="watchlist" element={<ErrorBoundary><WatchlistPage /></ErrorBoundary>} />
          <Route path="alerts" element={<ErrorBoundary><AlertsPage /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
          <Route path="status" element={<ErrorBoundary><StatusPage /></ErrorBoundary>} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

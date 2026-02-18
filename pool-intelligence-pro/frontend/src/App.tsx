import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/pools" replace />} />
          <Route path="pools" element={<PoolsPage />} />
          <Route path="pools/:chain/:address" element={<PoolDetailPage />} />
          <Route path="token-analyzer" element={<TokenAnalyzerPage />} />
          <Route path="radar" element={<RadarPage />} />
          <Route path="positions" element={<PositionsPage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="simulation" element={<SimulationPage />} />
          <Route path="simulation/:chain/:address" element={<SimulationPage />} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="status" element={<StatusPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

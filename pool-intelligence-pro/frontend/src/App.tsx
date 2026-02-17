import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import RadarPage from './pages/Radar';
import PositionsPage from './pages/Positions';
import RecommendationsPage from './pages/Recommendations';
import SimulationPage from './pages/Simulation';
import WatchlistPage from './pages/Watchlist';
import AlertsPage from './pages/Alerts';
import StatusPage from './pages/Status';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/radar" replace />} />
          <Route path="radar" element={<RadarPage />} />
          <Route path="positions" element={<PositionsPage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="simulation" element={<SimulationPage />} />
          <Route path="simulation/:chain/:address" element={<SimulationPage />} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="status" element={<StatusPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

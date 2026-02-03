import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import PoolsRecommended from './pages/PoolsRecommended';
import PoolDetail from './pages/PoolDetail';
import ActivePositions from './pages/ActivePositions';
import History from './pages/History';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="pools" element={<PoolsRecommended />} />
          <Route path="pools/:id" element={<PoolDetail />} />
          <Route path="positions" element={<ActivePositions />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

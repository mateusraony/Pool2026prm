import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/radar', icon: '📡', label: 'Radar' },
  { path: '/recommendations', icon: '🧠', label: 'Recomendações IA' },
  { path: '/simulation', icon: '🧪', label: 'Simulação' },
  { path: '/watchlist', icon: '👀', label: 'Watchlist' },
  { path: '/alerts', icon: '🚨', label: 'Alertas' },
  { path: '/status', icon: '🩺', label: 'Status' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="text-2xl">🌊</span>
          Pool Intelligence
        </h1>
        <p className="text-xs text-gray-500 mt-1">Enterprise DeFi Analytics</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ' +
              (isActive
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800')
            }
          >
            <span className="text-lg">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="text-xs text-gray-600">
          <p>v1.0.0 Pro</p>
          <p className="mt-1">Free Tier - Render</p>
        </div>
      </div>
    </aside>
  );
}

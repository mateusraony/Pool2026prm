import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Droplets,
  Wallet,
  History,
  Settings,
  Activity,
} from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pools', icon: Droplets, label: 'Pools Recomendadas' },
  { to: '/positions', icon: Wallet, label: 'Posições Ativas' },
  { to: '/history', icon: History, label: 'Histórico' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-dark-900 border-r border-dark-700 fixed h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-dark-700">
        <Activity className="w-8 h-8 text-primary-500 mr-3" />
        <div>
          <h1 className="font-bold text-lg text-dark-100">LP Intelligence</h1>
          <p className="text-xs text-dark-400">DeFi Analytics</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center px-4 py-3 rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary-600/20 text-primary-400'
                      : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                  )
                }
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-dark-700">
        <div className="flex items-center justify-between text-xs text-dark-400">
          <span>v1.0.0</span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-400"
          >
            GitHub
          </a>
        </div>
      </div>
    </aside>
  );
}

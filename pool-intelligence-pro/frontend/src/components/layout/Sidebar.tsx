import { useState, createContext, useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { path: '/pools', icon: '🏊', label: 'Pool Intelligence' },
  { path: '/token-analyzer', icon: '🔍', label: 'Token Analyzer' },
  { path: '/radar', icon: '📡', label: 'Radar' },
  { path: '/positions', icon: '💼', label: 'Minhas Posições' },
  { path: '/recommendations', icon: '🧠', label: 'Recomendações' },
  { path: '/simulation', icon: '🧪', label: 'Simulação' },
  { path: '/watchlist', icon: '⭐', label: 'Watchlist' },
  { path: '/alerts', icon: '🚨', label: 'Alertas' },
  { path: '/settings', icon: '⚙️', label: 'Configurações' },
  { path: '/status', icon: '🩺', label: 'Status' },
];

// Context for sidebar state
export const SidebarContext = createContext<{
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
}>({
  isCollapsed: false,
  setIsCollapsed: () => {},
  isMobileOpen: false,
  setIsMobileOpen: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

// Mobile menu button for header
export function MobileMenuButton() {
  const { isMobileOpen, setIsMobileOpen } = useSidebar();

  return (
    <button
      onClick={() => setIsMobileOpen(!isMobileOpen)}
      className="lg:hidden p-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
    >
      {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </button>
  );
}

export default function Sidebar() {
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'bg-gray-900 border-r border-gray-800 flex flex-col z-50 transition-all duration-300',
          // Desktop
          'hidden lg:flex',
          isCollapsed ? 'lg:w-16' : 'lg:w-64',
          // Mobile - fixed overlay
          isMobileOpen && 'fixed inset-y-0 left-0 w-64 flex lg:relative'
        )}
      >
        {/* Logo */}
        <div className={clsx(
          'p-4 border-b border-gray-800 flex items-center',
          isCollapsed ? 'justify-center' : 'justify-between'
        )}>
          {isCollapsed ? (
            <span className="text-2xl">🌊</span>
          ) : (
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">🌊</span>
                Pool Intelligence
              </h1>
              <p className="text-xs text-gray-500 mt-1">Enterprise DeFi Analytics</p>
            </div>
          )}

          {/* Collapse button - desktop only */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={clsx(
              'hidden lg:flex p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors',
              isCollapsed && 'absolute -right-3 top-6 shadow-lg'
            )}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          {/* Close button - mobile only */}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800',
                  isCollapsed && 'justify-center px-2'
                )
              }
              title={isCollapsed ? item.label : undefined}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              {!isCollapsed && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className={clsx(
          'p-4 border-t border-gray-800',
          isCollapsed && 'p-2 text-center'
        )}>
          {isCollapsed ? (
            <span className="text-xs text-gray-600">v1.0</span>
          ) : (
            <div className="text-xs text-gray-600">
              <p>v1.0.0 Pro</p>
              <p className="mt-1">Free Tier - Render</p>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile sidebar (visible when open) */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-50 transition-transform duration-300 lg:hidden',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-2xl">🌊</span>
              Pool Intelligence
            </h1>
            <p className="text-xs text-gray-500 mt-1">Enterprise DeFi</p>
          </div>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                )
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
          <p>v1.0.0 Pro</p>
        </div>
      </aside>
    </>
  );
}

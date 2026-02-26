import { useState, createContext, useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const navSections = [
  {
    title: 'Dashboard',
    items: [
      { path: '/dashboard', icon: '📊', label: 'Dashboard' },
    ],
  },
  {
    title: 'Análise',
    items: [
      { path: '/pools', icon: '🏊', label: 'Pool Intelligence' },
      { path: '/token-analyzer', icon: '🔍', label: 'Token Analyzer' },
      { path: '/radar', icon: '📡', label: 'Radar' },
      { path: '/recommended', icon: '🧠', label: 'Recomendadas' },
      { path: '/manual', icon: '🧪', label: 'Análise Manual' },
    ],
  },
  {
    title: 'Operações',
    items: [
      { path: '/positions', icon: '💼', label: 'Posições' },
      { path: '/active', icon: '🟢', label: 'Pools Ativas' },
      { path: '/simulation', icon: '📐', label: 'Simulação' },
    ],
  },
  {
    title: 'Gerenciamento',
    items: [
      { path: '/watchlist', icon: '⭐', label: 'Watchlist' },
      { path: '/favorites', icon: '❤️', label: 'Favoritas' },
      { path: '/history', icon: '📜', label: 'Histórico' },
      { path: '/alerts', icon: '🚨', label: 'Alertas' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { path: '/scout-settings', icon: '⚙️', label: 'Configurações' },
      { path: '/settings', icon: '🔧', label: 'Config. Sistema' },
      { path: '/status', icon: '🩺', label: 'Status' },
    ],
  },
];

// Flat list for backward compat
const allNavItems = navSections.flatMap((s) => s.items);

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

export function MobileMenuButton() {
  const { isMobileOpen, setIsMobileOpen } = useSidebar();

  return (
    <button
      onClick={() => setIsMobileOpen(!isMobileOpen)}
      className="lg:hidden p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
    >
      {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </button>
  );
}

function SidebarContent({ collapsed, onNavClick }: { collapsed: boolean; onNavClick?: () => void }) {
  return (
    <>
      {/* Logo */}
      <div className={cn(
        'p-4 border-b border-border flex items-center',
        collapsed ? 'justify-center' : 'gap-2'
      )}>
        <span className="text-2xl">🌊</span>
        {!collapsed && (
          <div>
            <h1 className="text-lg font-bold text-foreground">Pool Intelligence</h1>
            <p className="text-[10px] text-muted-foreground">Enterprise DeFi Analytics</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-4 overflow-y-auto scrollbar-thin">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onNavClick}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm',
                      isActive
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                      collapsed && 'justify-center px-2'
                    )
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <span className="text-base flex-shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn(
        'p-4 border-t border-border',
        collapsed && 'p-2 text-center'
      )}>
        {collapsed ? (
          <span className="text-[10px] text-muted-foreground">v3.0</span>
        ) : (
          <div className="text-xs text-muted-foreground">
            <p>v3.0.0 Pro</p>
            <p className="mt-0.5 text-[10px]">Pool Intelligence + Scout Pro</p>
          </div>
        )}
      </div>
    </>
  );
}

export default function Sidebar() {
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'bg-sidebar border-r border-sidebar-border flex-col z-50 transition-all duration-300 relative',
          'hidden lg:flex',
          isCollapsed ? 'lg:w-16' : 'lg:w-60'
        )}
      >
        <SidebarContent collapsed={isCollapsed} />

        {/* Collapse toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'absolute -right-3 top-6 hidden lg:flex p-1 rounded-full bg-secondary border border-border',
            'hover:bg-primary/20 transition-colors shadow-lg z-10'
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-transform duration-300 lg:hidden',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent
          collapsed={false}
          onNavClick={() => setIsMobileOpen(false)}
        />
        <button
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 lg:hidden"
        >
          <X className="w-4 h-4" />
        </button>
      </aside>
    </>
  );
}

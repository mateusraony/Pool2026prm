import { useState, createContext, useContext, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LayoutDashboard,
  Brain,
  Droplets,
  Search,
  Radar,
  CircleDot,
  Ruler,
  Heart,
  ScrollText,
  Bell,
  Settings,
  Activity,
  GitCompareArrows,
  PieChart,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';

const navSections = [
  {
    title: 'Dashboard',
    items: [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/portfolio', icon: PieChart, label: 'Portfolio' },
      { path: '/wallet-tracker', icon: Wallet, label: 'Wallets' },
    ],
  },
  {
    title: 'Analise',
    items: [
      { path: '/recommended', icon: Brain, label: 'Recomendadas' },
      { path: '/pools', icon: Droplets, label: 'Pool Intelligence' },
      { path: '/token-analyzer', icon: Search, label: 'Token Analyzer' },
      { path: '/radar', icon: Radar, label: 'Radar' },
      { path: '/compare', icon: GitCompareArrows, label: 'Comparador' },
    ],
  },
  {
    title: 'Operacoes',
    items: [
      { path: '/active', icon: CircleDot, label: 'Pools Ativas' },
      { path: '/simulation', icon: Ruler, label: 'Simulacao' },
    ],
  },
  {
    title: 'Gerenciamento',
    items: [
      { path: '/favorites', icon: Heart, label: 'Favoritas' },
      { path: '/history', icon: ScrollText, label: 'Historico' },
      { path: '/alerts', icon: Bell, label: 'Alertas' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { path: '/scout-settings', icon: Settings, label: 'Configuracoes' },
      { path: '/status', icon: Activity, label: 'Status' },
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
  const { unreadCount } = useNotifications();

  return (
    <>
      {/* Logo */}
      <div className={cn(
        'p-4 border-b border-sidebar-border flex items-center',
        collapsed ? 'justify-center' : 'gap-3'
      )}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary flex-shrink-0">
          <Droplets className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-base font-bold text-foreground font-display tracking-tight">Pool Intelligence</h1>
            <p className="text-[10px] text-muted-foreground tracking-wide">Enterprise DeFi Analytics</p>
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
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onNavClick}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm',
                        isActive
                          ? 'bg-primary/12 text-primary font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                        collapsed && 'justify-center px-2'
                      )
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                    {!collapsed && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                    {item.path === '/alerts' && unreadCount > 0 && (
                      <span className={cn(
                        'flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground',
                        collapsed ? 'absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5' : 'min-w-[18px] h-[18px] px-1'
                      )}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </NavLink>
                );
              })}
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

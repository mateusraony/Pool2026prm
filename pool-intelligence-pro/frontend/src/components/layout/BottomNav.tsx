/**
 * Bottom Navigation Bar — mobile-only (lg:hidden).
 * Quick access to the 5 most important pages without opening the sidebar drawer.
 * Touch-friendly: 48px min height targets (WCAG AAA).
 */
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Droplets, Heart, Bell, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';

const bottomNavItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { path: '/pools', icon: Droplets, label: 'Pools' },
  { path: '/favorites', icon: Heart, label: 'Favoritas' },
  { path: '/alerts', icon: Bell, label: 'Alertas' },
  { path: '/scout-settings', icon: Settings, label: 'Config' },
];

export function BottomNav() {
  const { unreadCount } = useNotifications();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-sidebar border-t border-sidebar-border safe-area-bottom">
      <div className="flex items-stretch justify-around">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 min-h-[48px] py-1.5 relative transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.path === '/alerts' && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground px-0.5">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 leading-tight">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

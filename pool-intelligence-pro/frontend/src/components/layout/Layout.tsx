import { Outlet } from 'react-router-dom';
import Sidebar, { SidebarProvider } from './Sidebar';
import Header from './Header';
import { NotificationContext, useNotificationState } from '@/hooks/useNotifications';

export default function Layout() {
  const notificationState = useNotificationState();

  return (
    <NotificationContext.Provider value={notificationState}>
      <SidebarProvider>
        <div className="flex h-screen bg-background text-foreground">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <Header />
            <main className="flex-1 overflow-auto p-4 lg:p-6 scrollbar-thin">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </NotificationContext.Provider>
  );
}

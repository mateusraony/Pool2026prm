import { Outlet } from 'react-router-dom';
import Sidebar, { SidebarProvider } from './Sidebar';
import Header from './Header';

export default function Layout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen bg-gray-950 text-white">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header />
          <main className="flex-1 overflow-auto p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

import { useState, useCallback, useEffect, createContext, useContext } from 'react';

export interface AppNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  link?: string;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const STORAGE_KEY = 'pool-intel-notifications';
const MAX_NOTIFICATIONS = 50;

function loadFromStorage(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(notifications: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  } catch {
    // ignore storage errors
  }
}

export function useNotificationState(): NotificationState {
  const [notifications, setNotifications] = useState<AppNotification[]>(loadFromStorage);

  useEffect(() => {
    saveToStorage(notifications);
  }, [notifications]);

  const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) => {
    const notification: AppNotification = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      isRead: false,
    };
    setNotifications((prev) => [notification, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return { notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll };
}

// Context for sharing notifications across components
export const NotificationContext = createContext<NotificationState>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearAll: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

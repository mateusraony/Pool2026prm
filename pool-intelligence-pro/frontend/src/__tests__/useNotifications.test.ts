import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationState } from '../hooks/useNotifications';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe('useNotificationState', () => {
  it('starts with empty notifications', () => {
    const { result } = renderHook(() => useNotificationState());
    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it('addNotification adds a new notification', () => {
    const { result } = renderHook(() => useNotificationState());
    act(() => {
      result.current.addNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
      });
    });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Test');
    expect(result.current.notifications[0].isRead).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it('addNotification sets id and timestamp automatically', () => {
    const { result } = renderHook(() => useNotificationState());
    act(() => {
      result.current.addNotification({ type: 'success', title: 'T', message: 'M' });
    });
    const n = result.current.notifications[0];
    expect(n.id).toMatch(/^notif-/);
    expect(n.timestamp).toBeTruthy();
  });

  it('markAsRead marks one notification as read', () => {
    const { result } = renderHook(() => useNotificationState());
    act(() => {
      result.current.addNotification({ type: 'info', title: 'A', message: 'M' });
      result.current.addNotification({ type: 'warning', title: 'B', message: 'N' });
    });
    const id = result.current.notifications[0].id;
    act(() => { result.current.markAsRead(id); });
    expect(result.current.notifications[0].isRead).toBe(true);
    expect(result.current.notifications[1].isRead).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it('markAllAsRead marks all as read', () => {
    const { result } = renderHook(() => useNotificationState());
    act(() => {
      result.current.addNotification({ type: 'info', title: 'A', message: 'M' });
      result.current.addNotification({ type: 'info', title: 'B', message: 'N' });
    });
    act(() => { result.current.markAllAsRead(); });
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.isRead)).toBe(true);
  });

  it('clearAll removes all notifications', () => {
    const { result } = renderHook(() => useNotificationState());
    act(() => {
      result.current.addNotification({ type: 'info', title: 'A', message: 'M' });
    });
    act(() => { result.current.clearAll(); });
    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it('newest notification appears first', () => {
    const { result } = renderHook(() => useNotificationState());
    act(() => {
      result.current.addNotification({ type: 'info', title: 'First', message: 'M' });
      result.current.addNotification({ type: 'info', title: 'Second', message: 'N' });
    });
    expect(result.current.notifications[0].title).toBe('Second');
  });

  it('persists notifications to localStorage', () => {
    const { result } = renderHook(() => useNotificationState());
    act(() => {
      result.current.addNotification({ type: 'info', title: 'Persist', message: 'M' });
    });
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });
});

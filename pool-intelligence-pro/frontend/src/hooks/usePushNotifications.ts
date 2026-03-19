/**
 * usePushNotifications — ETAPA 17
 * Hook para gerenciar push notifications via Web Push API.
 */

import { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';

type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading');
  const [error, setError] = useState<string | null>(null);

  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!isSupported) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setState(sub ? 'subscribed' : 'unsubscribed');
      });
    });
  }, [isSupported]);

  const subscribe = async (): Promise<boolean> => {
    if (!isSupported) return false;
    setState('loading');
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return false;
      }

      // Get VAPID public key from backend
      const { data: keyData } = await apiClient.get<{ success: boolean; data: { publicKey: string } }>('/push/vapid-public-key');
      const publicKey = keyData.data.publicKey;
      if (!publicKey) throw new Error('No VAPID public key');

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Register subscription on backend
      await apiClient.post('/push/subscribe', subscription.toJSON());
      setState('subscribed');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao ativar notificações';
      setError(msg);
      setState('unsubscribed');
      return false;
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    if (!isSupported) return false;
    setState('loading');

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await apiClient.delete('/push/unsubscribe', { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setState('unsubscribed');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao desativar notificações';
      setError(msg);
      setState('subscribed');
      return false;
    }
  };

  return { state, error, subscribe, unsubscribe, isSupported };
}

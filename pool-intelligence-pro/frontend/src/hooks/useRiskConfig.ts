/**
 * Risk configuration hook.
 * Uses localStorage for persistence (no Supabase dependency).
 * Can be extended to sync with the Pool2026prm backend settings API.
 */

import { useState, useEffect, useCallback } from 'react';
import type { RiskConfig } from '@/types/pool';
import { fetchSettings } from '@/api/client';
import { toast } from 'sonner';

const STORAGE_KEY = 'pool-intelligence-risk-config';

const DEFAULT_RISK_CONFIG: RiskConfig = {
  totalBanca: 10000,
  profile: 'normal',
  maxPerPool: 5,
  maxPerNetwork: 25,
  maxVolatile: 20,
  allowedNetworks: ['Ethereum', 'Arbitrum', 'Base', 'Optimism', 'Polygon'],
  allowedDexs: ['Uniswap V3', 'Velodrome', 'Aerodrome'],
  allowedTokens: ['ETH', 'USDC', 'USDT', 'WBTC', 'ARB'],
  excludeMemecoins: true,
  telegramEnabled: false,
  telegramChatId: undefined,
};

export function useRiskConfig() {
  const [config, setConfig] = useState<RiskConfig>(DEFAULT_RISK_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // First try localStorage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setConfig(JSON.parse(saved));
      }

      // Then try to sync with backend settings
      try {
        const settings = await fetchSettings();
        if (settings?.system) {
          const merged: RiskConfig = {
            ...config,
            ...(saved ? JSON.parse(saved) : {}),
            totalBanca: settings.system.capital || DEFAULT_RISK_CONFIG.totalBanca,
            profile: settings.system.mode as RiskConfig['profile'] || 'normal',
            allowedNetworks: settings.system.chains?.map(
              (c: string) => c.charAt(0).toUpperCase() + c.slice(1)
            ) || DEFAULT_RISK_CONFIG.allowedNetworks,
            telegramEnabled: settings.telegram?.enabled ?? false,
          };
          setConfig(merged);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      } catch {
        // Backend not available, use local config
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch config';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveConfig = useCallback(async (newConfig: RiskConfig) => {
    try {
      setSaving(true);
      setError(null);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
      toast.success('Configurações salvas com sucesso!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save config';
      setError(message);
      toast.error(`Erro ao salvar configurações: ${message}`);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    saving,
    error,
    saveConfig,
    refetch: fetchConfig,
  };
}

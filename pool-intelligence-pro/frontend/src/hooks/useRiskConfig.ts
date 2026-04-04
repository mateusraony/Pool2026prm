/**
 * Risk configuration hook.
 * Uses localStorage for fast access + syncs with backend for persistence across devices/deploys.
 */

import { useState, useEffect, useCallback } from 'react';
import type { RiskConfig } from '@/types/pool';
import { fetchSettings, saveRiskConfig } from '@/api/client';
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

      // First try localStorage for instant load
      const saved = localStorage.getItem(STORAGE_KEY);
      let localConfig: RiskConfig | null = null;
      if (saved) {
        try {
          localConfig = JSON.parse(saved);
          setConfig(localConfig!);
        } catch {
          // Corrupted localStorage, ignore
        }
      }

      // Then sync with backend (source of truth)
      try {
        const settings = await fetchSettings();

        // If backend has persisted riskConfig, use it (overrides localStorage)
        if (settings.riskConfig) {
          const backendConfig: RiskConfig = {
            ...DEFAULT_RISK_CONFIG,
            ...settings.riskConfig,
            telegramEnabled: settings.telegram?.enabled ?? false,
          };
          setConfig(backendConfig);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(backendConfig));
        } else if (localConfig) {
          // Backend has no config yet - push localStorage to backend as initial seed
          try {
            await saveRiskConfig(localConfig);
          } catch {
            // Non-critical, will be saved on next user action
          }
        }
      } catch {
        // Backend not available, use local config (already set above)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch config';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveConfigFn = useCallback(async (newConfig: RiskConfig) => {
    try {
      setSaving(true);
      setError(null);

      // Save to localStorage immediately (fast)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);

      // Save to backend (persistent across server restarts)
      try {
        await saveRiskConfig(newConfig);
      } catch {
        // Non-critical: localStorage has it, backend will sync on next load
      }

      toast.success('Configuracoes salvas com sucesso!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save config';
      setError(message);
      toast.error(`Erro ao salvar configuracoes: ${message}`);
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
    saveConfig: saveConfigFn,
    refetch: fetchConfig,
  };
}

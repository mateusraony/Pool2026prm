import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, AlertTriangle } from 'lucide-react';
import { fetchSettings, updateSettings } from '../api/client';
import clsx from 'clsx';

interface SettingsData {
  totalBankroll: number;
  riskProfile: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';
  maxPercentPerPool: number;
  maxPercentPerNetwork: number;
  maxPercentVolatile: number;
  enabledNetworks: string[];
  allowedPairTypes: string[];
  telegramChatId: string | null;
}

const NETWORKS = [
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'arbitrum', name: 'Arbitrum' },
  { id: 'base', name: 'Base' },
  { id: 'polygon', name: 'Polygon' },
  { id: 'optimism', name: 'Optimism' },
];

const PAIR_TYPES = [
  { id: 'stable_stable', name: 'Stable/Stable (ex: USDC/DAI)' },
  { id: 'bluechip_stable', name: 'Bluechip/Stable (ex: ETH/USDC)' },
  { id: 'altcoin_stable', name: 'Altcoin/Stable (ex: ARB/USDC)' },
];

export default function Settings() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });

  const [form, setForm] = useState<SettingsData | null>(null);

  // Inicializa form quando dados carregam
  if (data && !form) {
    setForm(data.settings);
  }

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form) {
      mutation.mutate(form);
    }
  };

  const toggleNetwork = (networkId: string) => {
    if (!form) return;
    const networks = form.enabledNetworks.includes(networkId)
      ? form.enabledNetworks.filter((n) => n !== networkId)
      : [...form.enabledNetworks, networkId];
    setForm({ ...form, enabledNetworks: networks });
  };

  const togglePairType = (pairTypeId: string) => {
    if (!form) return;
    const pairTypes = form.allowedPairTypes.includes(pairTypeId)
      ? form.allowedPairTypes.filter((p) => p !== pairTypeId)
      : [...form.allowedPairTypes, pairTypeId];
    setForm({ ...form, allowedPairTypes: pairTypes });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="card text-center py-12">
        <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar configurações</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações de Risco & Banca</h1>
        <p className="text-dark-400 mt-1">
          Defina suas preferências de risco e limites de exposição
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Banca */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Banca</h2>
          <div>
            <label className="label">Banca Total (USDT)</label>
            <input
              type="number"
              value={form.totalBankroll}
              onChange={(e) =>
                setForm({ ...form, totalBankroll: parseFloat(e.target.value) || 0 })
              }
              className="input max-w-xs"
              min="0"
              step="100"
            />
            <p className="text-xs text-dark-400 mt-1">
              Valor total disponível para prover liquidez
            </p>
          </div>
        </div>

        {/* Perfil de Risco */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Perfil de Risco</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['DEFENSIVE', 'NORMAL', 'AGGRESSIVE'] as const).map((profile) => (
              <button
                key={profile}
                type="button"
                onClick={() => setForm({ ...form, riskProfile: profile })}
                className={clsx(
                  'p-4 rounded-lg border-2 text-left transition-all',
                  form.riskProfile === profile
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-dark-700 hover:border-dark-500'
                )}
              >
                <span
                  className={clsx(
                    'font-semibold',
                    profile === 'DEFENSIVE'
                      ? 'text-success-400'
                      : profile === 'NORMAL'
                      ? 'text-primary-400'
                      : 'text-warning-400'
                  )}
                >
                  {profile === 'DEFENSIVE'
                    ? 'Defensivo'
                    : profile === 'NORMAL'
                    ? 'Normal'
                    : 'Agressivo'}
                </span>
                <p className="text-sm text-dark-400 mt-1">
                  {profile === 'DEFENSIVE'
                    ? 'Ranges largos, menor risco, menor retorno'
                    : profile === 'NORMAL'
                    ? 'Equilíbrio entre risco e retorno'
                    : 'Ranges estreitos, maior risco, maior retorno'}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Limites */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Limites de Exposição</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="label">Máx. % por Pool</label>
              <input
                type="number"
                value={form.maxPercentPerPool}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxPercentPerPool: parseFloat(e.target.value) || 0,
                  })
                }
                className="input"
                min="1"
                max="100"
                step="1"
              />
              <p className="text-xs text-dark-400 mt-1">
                Limite máximo de capital em uma única pool
              </p>
            </div>

            <div>
              <label className="label">Máx. % por Rede</label>
              <input
                type="number"
                value={form.maxPercentPerNetwork}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxPercentPerNetwork: parseFloat(e.target.value) || 0,
                  })
                }
                className="input"
                min="1"
                max="100"
                step="1"
              />
              <p className="text-xs text-dark-400 mt-1">
                Limite máximo de capital em uma única rede
              </p>
            </div>

            <div>
              <label className="label">Máx. % em Voláteis</label>
              <input
                type="number"
                value={form.maxPercentVolatile}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxPercentVolatile: parseFloat(e.target.value) || 0,
                  })
                }
                className="input"
                min="0"
                max="100"
                step="1"
              />
              <p className="text-xs text-dark-400 mt-1">
                Limite para pares com altcoins
              </p>
            </div>
          </div>
        </div>

        {/* Redes */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Redes Habilitadas</h2>
          <div className="flex flex-wrap gap-3">
            {NETWORKS.map((network) => (
              <button
                key={network.id}
                type="button"
                onClick={() => toggleNetwork(network.id)}
                className={clsx(
                  'px-4 py-2 rounded-lg border transition-all',
                  form.enabledNetworks.includes(network.id)
                    ? 'border-primary-500 bg-primary-500/20 text-primary-400'
                    : 'border-dark-600 text-dark-400 hover:border-dark-500'
                )}
              >
                {network.name}
              </button>
            ))}
          </div>
        </div>

        {/* Tipos de Par */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Tipos de Par Permitidos</h2>
          <div className="space-y-3">
            {PAIR_TYPES.map((pairType) => (
              <label
                key={pairType.id}
                className="flex items-center space-x-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={form.allowedPairTypes.includes(pairType.id)}
                  onChange={() => togglePairType(pairType.id)}
                  className="w-5 h-5 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500"
                />
                <span>{pairType.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Telegram */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Telegram</h2>
          <div>
            <label className="label">Chat ID</label>
            <input
              type="text"
              value={form.telegramChatId || ''}
              onChange={(e) =>
                setForm({ ...form, telegramChatId: e.target.value || null })
              }
              className="input max-w-xs"
              placeholder="Ex: 123456789"
            />
            <p className="text-xs text-dark-400 mt-1">
              ID do chat para receber alertas (use @userinfobot no Telegram)
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn btn-primary inline-flex items-center"
          >
            <Save className="w-4 h-4 mr-2" />
            {mutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </button>

          {saved && (
            <span className="text-success-400 text-sm">
              ✓ Configurações salvas com sucesso
            </span>
          )}

          {mutation.isError && (
            <span className="text-danger-400 text-sm">
              Erro ao salvar. Tente novamente.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

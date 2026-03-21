import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Settings, Plus, X, Send, Trash2 } from 'lucide-react';
import { fetchHealth, fetchPools, fetchAlerts, createAlert, deleteAlert, fetchSettings, Pool, Score } from '../api/client';
import clsx from 'clsx';
import { AlertType, alertTypeConfig } from '@/data/alert-events';

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [newAlert, setNewAlert] = useState<{
    poolId?: string;
    type: AlertType;
    threshold: number;
    condition?: { rangeLower: number; rangeUpper: number };
  }>({
    type: 'PRICE_BELOW',
    threshold: 0,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  const { data: pools } = useQuery({
    queryKey: ['pools'],
    queryFn: () => fetchPools(),
  });

  const { data: alerts, isLoading: loadingAlerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: fetchAlerts,
    refetchInterval: 30000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });

  const createMutation = useMutation({
    mutationFn: () => createAlert(newAlert.poolId, newAlert.type, newAlert.threshold, newAlert.condition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      setShowModal(false);
      setNewAlert({ type: 'PRICE_BELOW', threshold: 0, condition: undefined });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
    },
  });

  const isRangeType = newAlert.type === 'OUT_OF_RANGE' || newAlert.type === 'NEAR_RANGE_EXIT';
  const isGlobalType = newAlert.type === 'NEW_RECOMMENDATION';

  const isFormValid = (): boolean => {
    if (isRangeType) {
      return (
        !!newAlert.condition?.rangeLower &&
        !!newAlert.condition?.rangeUpper &&
        newAlert.condition.rangeUpper > newAlert.condition.rangeLower
      );
    }
    if (isGlobalType) return true;
    return newAlert.threshold > 0;
  };

  const handleCreate = () => {
    if (isFormValid()) {
      createMutation.mutate();
    }
  };

  const getPoolName = (poolId?: string): string => {
    if (!poolId) return 'Global';
    const pool = pools?.find(p => (p?.pool?.poolAddress || p?.pool?.externalId) === poolId);
    if (pool?.pool?.token0?.symbol && pool?.pool?.token1?.symbol) {
      return pool.pool.token0.symbol + '/' + pool.pool.token1.symbol;
    }
    return poolId.slice(0, 12) + '...';
  };

  const telegramConnected = (settings as any)?.telegram?.enabled ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">🚨 Alertas</h1>
          <p className="text-dark-400 mt-1">Configure notificacoes automaticas</p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2"
          onClick={() => setShowModal(true)}
        >
          <Plus className="w-4 h-4" />
          Novo Alerta
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary-400" />
              Alertas Ativos ({alerts?.rules?.length || 0})
            </h3>
          </div>
          <div className="card-body">
            {loadingAlerts ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-dark-700 rounded animate-pulse" />
                ))}
              </div>
            ) : alerts?.rules && alerts.rules.length > 0 ? (
              <div className="space-y-3">
                {alerts.rules.map(({ id, rule }) => {
                  const config = alertTypeConfig[rule.type as AlertType];
                  return (
                    <div
                      key={id}
                      className="p-3 rounded-lg border bg-dark-700/50 border-dark-600"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{config?.icon || '🔔'}</span>
                          <div>
                            <div className="font-medium">{config?.label || rule.type}</div>
                            <div className="text-sm text-dark-400">
                              Pool: {getPoolName(rule.poolId)} | Limite: {rule.value}{config?.unit || ''}
                            </div>
                          </div>
                        </div>
                        <button
                          className="p-2 rounded-lg bg-danger-600 hover:bg-danger-500 transition-colors"
                          onClick={() => { if (window.confirm('Remover este alerta?')) deleteMutation.mutate(id); }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-dark-400">
                <BellOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum alerta configurado</p>
                <p className="text-sm mt-1">Clique em "Novo Alerta" para criar</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Configuracoes
              </h3>
            </div>
            <div className="card-body space-y-4">
              <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
                <span>Cooldown entre alertas</span>
                <span className="text-primary-400 font-medium">{settings?.alertConfig?.cooldownMinutes ?? 60} min</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
                <span>Max alertas por hora</span>
                <span className="text-primary-400 font-medium">{settings?.alertConfig?.maxAlertsPerHour ?? 30}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
                <span>Modo atual</span>
                <span className="badge badge-warning">{(settings as any)?.system?.mode || (settings as any)?.mode || 'NORMAL'}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  <span>Telegram Bot</span>
                </div>
                <span className={clsx('badge', telegramConnected ? 'badge-success' : 'badge-danger')}>
                  {telegramConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold">Estatisticas</h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-2 gap-3">
                <div className="stat-card">
                  <div className="stat-label">Alertas hoje</div>
                  <div className="stat-value">{health?.alerts?.triggersToday || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Total de regras</div>
                  <div className="stat-value">{alerts?.rules?.length || 0}</div>
                </div>
              </div>
            </div>
          </div>

          {alerts?.recentAlerts && alerts.recentAlerts.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold">Alertas Recentes</h3>
              </div>
              <div className="card-body">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {alerts.recentAlerts.slice(0, 5).map((alert, i) => (
                    <div key={i} className="p-2 bg-dark-700/50 rounded text-sm">
                      <div className="font-medium">{alert.message}</div>
                      <div className="text-xs text-dark-400">
                        {new Date(alert.timestamp).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg">
            <div className="card-header flex items-center justify-between">
              <h3 className="font-semibold">Novo Alerta</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-dark-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="card-body space-y-4">
              <div>
                <label className="block text-sm text-dark-400 mb-2">Pool (opcional - deixe vazio para global)</label>
                <select
                  className="input w-full"
                  value={newAlert.poolId || ''}
                  onChange={(e) => setNewAlert({ ...newAlert, poolId: e.target.value || undefined })}
                >
                  <option value="">🌐 Global (todas as pools)</option>
                  {pools?.slice(0, 30).map((item) => (
                    <option key={item.pool.poolAddress || item.pool.externalId} value={item.pool.poolAddress || item.pool.externalId}>
                      {item.pool.token0?.symbol ?? '?'}/{item.pool.token1?.symbol ?? '?'} - {item.pool.protocol}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-dark-400 mb-2">Tipo de Alerta</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(alertTypeConfig) as AlertType[]).map(type => {
                    const config = alertTypeConfig[type];
                    return (
                      <button
                        key={type}
                        className={clsx(
                          'p-3 rounded-lg border-2 transition-all text-left',
                          newAlert.type === type ? 'border-primary-500 bg-primary-500/10' : 'border-dark-600 hover:border-dark-500'
                        )}
                        onClick={() => setNewAlert({ ...newAlert, type, condition: undefined })}
                      >
                        <div className="text-lg mb-1">{config.icon}</div>
                        <div className="text-sm font-medium">{config.label}</div>
                        <div className="text-xs text-dark-400">{config.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isRangeType ? (
                <div className="space-y-3">
                  <label className="block text-sm text-dark-400">Range de Preço</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Limite Inferior ($)</label>
                      <input
                        type="number"
                        className="input w-full"
                        value={newAlert.condition?.rangeLower || ''}
                        onChange={(e) => setNewAlert({
                          ...newAlert,
                          condition: { rangeLower: Number(e.target.value), rangeUpper: newAlert.condition?.rangeUpper ?? 0 },
                        })}
                        placeholder="Ex: 1800"
                        step="any"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Limite Superior ($)</label>
                      <input
                        type="number"
                        className="input w-full"
                        value={newAlert.condition?.rangeUpper || ''}
                        onChange={(e) => setNewAlert({
                          ...newAlert,
                          condition: { rangeLower: newAlert.condition?.rangeLower ?? 0, rangeUpper: Number(e.target.value) },
                        })}
                        placeholder="Ex: 2200"
                        step="any"
                      />
                    </div>
                  </div>
                  {newAlert.type === 'NEAR_RANGE_EXIT' && (
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">
                        Proximidade para alertar (% do limite) — padrão: 5%
                      </label>
                      <input
                        type="number"
                        className="input w-full"
                        value={newAlert.threshold || ''}
                        onChange={(e) => setNewAlert({ ...newAlert, threshold: Number(e.target.value) })}
                        placeholder="5"
                        min="1"
                        max="20"
                      />
                    </div>
                  )}
                </div>
              ) : !isGlobalType && (
                <div>
                  <label className="block text-sm text-dark-400 mb-2">
                    Valor ({alertTypeConfig[newAlert.type]?.unit || '$'})
                  </label>
                  <input
                    type="number"
                    className="input w-full"
                    value={newAlert.threshold || ''}
                    onChange={(e) => setNewAlert({ ...newAlert, threshold: Number(e.target.value) })}
                    placeholder="Ex: 1000"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button className="btn btn-secondary flex-1" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary flex-1"
                  onClick={handleCreate}
                  disabled={!isFormValid() || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Criando...' : 'Criar Alerta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

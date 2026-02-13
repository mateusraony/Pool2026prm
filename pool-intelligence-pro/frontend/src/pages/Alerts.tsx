import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff, Settings, Plus, X, Send } from 'lucide-react';
import { fetchHealth, fetchWatchlist, fetchSettings } from '../api/client';
import clsx from 'clsx';

type AlertType = 'PRICE_DROP' | 'TVL_DROP' | 'APR_CHANGE' | 'SCORE_CHANGE';

interface AlertRule {
  id: string;
  poolId: string;
  type: AlertType;
  threshold: number;
  enabled: boolean;
}

const alertTypeConfig: Record<AlertType, { label: string; icon: string; unit: string }> = {
  PRICE_DROP: { label: 'Queda de Preco', icon: '📉', unit: '%' },
  TVL_DROP: { label: 'Queda de TVL', icon: '💧', unit: '%' },
  APR_CHANGE: { label: 'Mudanca de APR', icon: '📊', unit: '%' },
  SCORE_CHANGE: { label: 'Mudanca de Score', icon: '🎯', unit: 'pts' },
};

export default function AlertsPage() {
  const [showModal, setShowModal] = useState(false);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [newRule, setNewRule] = useState<Partial<AlertRule>>({
    type: 'PRICE_DROP',
    threshold: 10,
    enabled: true,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  const { data: watchlist } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });

  const handleAddRule = () => {
    if (newRule.poolId && newRule.type && newRule.threshold) {
      setRules([...rules, {
        id: Date.now().toString(),
        poolId: newRule.poolId,
        type: newRule.type as AlertType,
        threshold: newRule.threshold,
        enabled: true,
      }]);
      setShowModal(false);
      setNewRule({ type: 'PRICE_DROP', threshold: 10, enabled: true });
    }
  };

  const toggleRule = (id: string) => {
    setRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const telegramConnected = health?.alerts?.rulesCount !== undefined;

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
          disabled={!watchlist?.length}
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
              Alertas Ativos ({rules.filter(r => r.enabled).length})
            </h3>
          </div>
          <div className="card-body">
            {rules.length > 0 ? (
              <div className="space-y-3">
                {rules.map(rule => {
                  const config = alertTypeConfig[rule.type];
                  return (
                    <div
                      key={rule.id}
                      className={clsx(
                        'p-3 rounded-lg border transition-all',
                        rule.enabled ? 'bg-dark-700/50 border-dark-600' : 'bg-dark-800/50 border-dark-700 opacity-50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{config.icon}</span>
                          <div>
                            <div className="font-medium">{config.label}</div>
                            <div className="text-sm text-dark-400">
                              Pool: {rule.poolId.slice(0, 15)}... | Limite: {rule.threshold}{config.unit}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className={clsx(
                              'p-2 rounded-lg transition-colors',
                              rule.enabled ? 'bg-success-600' : 'bg-dark-600'
                            )}
                            onClick={() => toggleRule(rule.id)}
                          >
                            {rule.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                          </button>
                          <button
                            className="p-2 rounded-lg bg-danger-600 hover:bg-danger-500"
                            onClick={() => deleteRule(rule.id)}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-dark-400">
                <BellOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum alerta configurado</p>
                <p className="text-sm mt-1">
                  {watchlist?.length ? 'Clique em "Novo Alerta" para criar' : 'Adicione pools à watchlist primeiro'}
                </p>
              </div>
            )}
          </div>
        </div>

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
              <span className="text-primary-400 font-medium">60 min</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
              <span>Max alertas por hora</span>
              <span className="text-primary-400 font-medium">10</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
              <span>Modo atual</span>
              <span className="badge badge-warning">{settings?.mode || 'NORMAL'}</span>
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

            <div className="pt-4 border-t border-dark-600">
              <h4 className="font-medium mb-3">Estatisticas</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="stat-card">
                  <div className="stat-label">Alertas hoje</div>
                  <div className="stat-value">{health?.alerts?.triggersToday || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Total de regras</div>
                  <div className="stat-value">{health?.alerts?.rulesCount || rules.length}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <div className="card-header flex items-center justify-between">
              <h3 className="font-semibold">Novo Alerta</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-dark-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="card-body space-y-4">
              <div>
                <label className="block text-sm text-dark-400 mb-2">Pool</label>
                <select
                  className="input w-full"
                  value={newRule.poolId || ''}
                  onChange={(e) => setNewRule({ ...newRule, poolId: e.target.value })}
                >
                  <option value="">Selecione uma pool...</option>
                  {watchlist?.map(w => (
                    <option key={w.poolId} value={w.poolId}>{w.poolId}</option>
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
                          newRule.type === type ? 'border-primary-500 bg-primary-500/10' : 'border-dark-600 hover:border-dark-500'
                        )}
                        onClick={() => setNewRule({ ...newRule, type })}
                      >
                        <div className="text-lg mb-1">{config.icon}</div>
                        <div className="text-sm font-medium">{config.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Limite ({alertTypeConfig[newRule.type as AlertType]?.unit || '%'})
                </label>
                <input
                  type="number"
                  className="input w-full"
                  value={newRule.threshold || ''}
                  onChange={(e) => setNewRule({ ...newRule, threshold: Number(e.target.value) })}
                  placeholder="Ex: 10"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button className="btn btn-secondary flex-1" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary flex-1"
                  onClick={handleAddRule}
                  disabled={!newRule.poolId || !newRule.threshold}
                >
                  Criar Alerta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

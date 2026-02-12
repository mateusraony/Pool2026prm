import { Bell, BellOff, Settings, Plus } from 'lucide-react';

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">🚨 Alertas</h1>
          <p className="text-dark-400 mt-1">Configure notificacoes automaticas</p>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Novo Alerta
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary-400" />
              Alertas Ativos
            </h3>
          </div>
          <div className="card-body">
            <div className="text-center py-8 text-dark-400">
              <BellOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum alerta configurado</p>
            </div>
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
            <div className="flex items-center justify-between">
              <span>Cooldown entre alertas</span>
              <span className="text-primary-400">60 min</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Max alertas por hora</span>
              <span className="text-primary-400">10</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Telegram Bot</span>
              <span className="badge badge-success">Conectado</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

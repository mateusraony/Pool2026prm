import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Link, Send, Check, X, RefreshCw, Clock } from 'lucide-react';
import {
  fetchSettings,
  updateNotificationSettings,
  testTelegramConnection,
  sendPortfolioReport,
  NotificationSettings,
} from '../api/client';
import clsx from 'clsx';

interface NotificationOption {
  key: keyof NotificationSettings['notifications'];
  label: string;
  description: string;
  emoji: string;
}

const NOTIFICATION_OPTIONS: NotificationOption[] = [
  {
    key: 'rangeExit',
    label: 'Saída do Range',
    description: 'Alerta quando o preço sai do range configurado',
    emoji: '🚨',
  },
  {
    key: 'nearRangeExit',
    label: 'Próximo do Limite',
    description: 'Alerta quando o preço se aproxima do limite do range',
    emoji: '⚠️',
  },
  {
    key: 'dailyReport',
    label: 'Relatório Diário',
    description: 'Resumo diário de todas as posições com análise IA',
    emoji: '📊',
  },
  {
    key: 'newRecommendation',
    label: 'Nova Recomendação',
    description: 'Quando a IA detecta uma nova oportunidade de alto score',
    emoji: '🏆',
  },
  {
    key: 'priceAlerts',
    label: 'Alertas de Preço',
    description: 'Alertas configurados de preço acima/abaixo de thresholds',
    emoji: '📈',
  },
  {
    key: 'systemAlerts',
    label: 'Alertas do Sistema',
    description: 'Notificações de saúde do sistema e provedores de dados',
    emoji: '🔧',
  },
];

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={clsx(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
        enabled ? 'bg-primary-600' : 'bg-dark-600'
      )}
    >
      <span
        className={clsx(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          enabled ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [reportStatus, setReportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [localSettings, setLocalSettings] = useState<Partial<NotificationSettings> | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });

  const updateMutation = useMutation({
    mutationFn: updateNotificationSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setLocalSettings(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const defaultSettings: NotificationSettings = {
    appUrl: '',
    notifications: { rangeExit: true, nearRangeExit: true, dailyReport: true, newRecommendation: false, priceAlerts: true, systemAlerts: false },
    dailyReportHour: 8,
    dailyReportMinute: 0,
  };
  const baseSettings: NotificationSettings = data?.notifications ?? defaultSettings;
  const settings: NotificationSettings = localSettings
    ? {
        ...baseSettings,
        appUrl: localSettings.appUrl ?? baseSettings.appUrl,
        dailyReportHour: localSettings.dailyReportHour ?? baseSettings.dailyReportHour,
        dailyReportMinute: localSettings.dailyReportMinute ?? baseSettings.dailyReportMinute,
        notifications: {
          rangeExit: localSettings.notifications?.rangeExit ?? baseSettings.notifications.rangeExit,
          nearRangeExit: localSettings.notifications?.nearRangeExit ?? baseSettings.notifications.nearRangeExit,
          dailyReport: localSettings.notifications?.dailyReport ?? baseSettings.notifications.dailyReport,
          newRecommendation: localSettings.notifications?.newRecommendation ?? baseSettings.notifications.newRecommendation,
          priceAlerts: localSettings.notifications?.priceAlerts ?? baseSettings.notifications.priceAlerts,
          systemAlerts: localSettings.notifications?.systemAlerts ?? baseSettings.notifications.systemAlerts,
        },
      }
    : baseSettings;

  function updateLocal(partial: Partial<NotificationSettings>) {
    setLocalSettings(prev => ({ ...(prev ?? {}), ...partial }));
  }

  function toggleNotification(key: keyof NotificationSettings['notifications'], value: boolean) {
    updateLocal({ notifications: { ...settings.notifications, [key]: value } });
  }

  async function handleTestTelegram() {
    setTestStatus('loading');
    try {
      const result = await testTelegramConnection();
      setTestStatus(result.success ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
    setTimeout(() => setTestStatus('idle'), 3000);
  }

  async function handleSendReport() {
    setReportStatus('loading');
    try {
      await sendPortfolioReport();
      setReportStatus('success');
    } catch {
      setReportStatus('error');
    }
    setTimeout(() => setReportStatus('idle'), 3000);
  }

  function handleSave() {
    if (localSettings) {
      updateMutation.mutate(localSettings);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const telegramEnabled = data?.telegram?.enabled;
  const hasUnsavedChanges = localSettings !== null;

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Configurações</h1>
          <p className="text-dark-400 mt-1">Gerencie notificações e integrações</p>
        </div>

        {hasUnsavedChanges && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : null}
            {saved ? 'Salvo!' : 'Salvar Alterações'}
          </button>
        )}
      </div>

      {/* Telegram Status */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="p-4 border-b border-dark-700">
          <h2 className="font-semibold flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-400" />
            Telegram
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Status da Integração</p>
              <p className="text-sm text-dark-400">
                {data?.telegram?.chatId
                  ? `Chat ID: ${data.telegram.chatId}`
                  : 'Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env'}
              </p>
            </div>
            <span className={clsx(
              'px-3 py-1 rounded-full text-sm font-medium',
              telegramEnabled
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            )}>
              {telegramEnabled ? '● Conectado' : '● Desconectado'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleTestTelegram}
              disabled={testStatus === 'loading' || !telegramEnabled}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50',
                testStatus === 'success' ? 'bg-green-600 text-white' :
                testStatus === 'error' ? 'bg-red-600 text-white' :
                'bg-dark-700 hover:bg-dark-600'
              )}
            >
              {testStatus === 'loading' ? <RefreshCw className="w-4 h-4 animate-spin" /> :
               testStatus === 'success' ? <Check className="w-4 h-4" /> :
               testStatus === 'error' ? <X className="w-4 h-4" /> :
               <Send className="w-4 h-4" />}
              {testStatus === 'success' ? 'Enviado!' :
               testStatus === 'error' ? 'Falhou' :
               'Testar Conexão'}
            </button>

            <button
              onClick={handleSendReport}
              disabled={reportStatus === 'loading' || !telegramEnabled}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50',
                reportStatus === 'success' ? 'bg-green-600 text-white' :
                reportStatus === 'error' ? 'bg-red-600 text-white' :
                'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30'
              )}
            >
              {reportStatus === 'loading' ? <RefreshCw className="w-4 h-4 animate-spin" /> :
               reportStatus === 'success' ? <Check className="w-4 h-4" /> :
               reportStatus === 'error' ? <X className="w-4 h-4" /> :
               <Bell className="w-4 h-4" />}
              {reportStatus === 'success' ? 'Enviado!' :
               reportStatus === 'error' ? 'Falhou' :
               'Enviar Relatório Agora'}
            </button>
          </div>

          {!telegramEnabled && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-400">
              Para ativar o Telegram, adicione <code className="bg-dark-700 px-1 rounded">TELEGRAM_BOT_TOKEN</code> e{' '}
              <code className="bg-dark-700 px-1 rounded">TELEGRAM_CHAT_ID</code> no arquivo <code className="bg-dark-700 px-1 rounded">.env</code> do backend.
            </div>
          )}
        </div>
      </div>

      {/* App URL */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="p-4 border-b border-dark-700">
          <h2 className="font-semibold flex items-center gap-2">
            <Link className="w-5 h-5 text-purple-400" />
            URL do Aplicativo
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-dark-400">
            URL base usada para gerar links nas mensagens do Telegram. Ex: se você expôs a aplicação com ngrok ou tem um domínio próprio.
          </p>
          <input
            type="url"
            value={settings.appUrl}
            onChange={e => updateLocal({ appUrl: e.target.value })}
            placeholder="http://localhost:5173"
            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none"
          />
          <p className="text-xs text-dark-500">
            Links gerados: <code className="text-dark-300">{settings.appUrl || 'http://localhost:5173'}/positions</code>
          </p>
        </div>
      </div>

      {/* Notification Types */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="p-4 border-b border-dark-700">
          <h2 className="font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5 text-yellow-400" />
            Tipos de Notificação
          </h2>
          <p className="text-sm text-dark-400 mt-1">Escolha quais alertas você quer receber no Telegram</p>
        </div>
        <div className="divide-y divide-dark-700">
          {NOTIFICATION_OPTIONS.map((option) => (
            <div key={option.key} className="flex items-center justify-between p-4">
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2">
                  <span>{option.emoji}</span>
                  <span className="font-medium">{option.label}</span>
                </div>
                <p className="text-sm text-dark-400 mt-0.5">{option.description}</p>
              </div>
              <Toggle
                enabled={settings.notifications[option.key]}
                onChange={(v) => toggleNotification(option.key, v)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Daily Report Schedule */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="p-4 border-b border-dark-700">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-green-400" />
            Horário do Relatório Diário
          </h2>
          <p className="text-sm text-dark-400 mt-1">
            Hora em que o relatório de posições será enviado (hora do servidor)
          </p>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs text-dark-400 mb-1">Hora</label>
              <input
                type="number"
                min={0}
                max={23}
                value={settings.dailyReportHour}
                onChange={e => updateLocal({ dailyReportHour: parseInt(e.target.value) || 0 })}
                className="w-20 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-center font-mono focus:border-primary-500 focus:outline-none"
              />
            </div>
            <span className="text-2xl text-dark-400 mt-4">:</span>
            <div>
              <label className="block text-xs text-dark-400 mb-1">Minuto</label>
              <input
                type="number"
                min={0}
                max={59}
                value={settings.dailyReportMinute}
                onChange={e => updateLocal({ dailyReportMinute: parseInt(e.target.value) || 0 })}
                className="w-20 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-center font-mono focus:border-primary-500 focus:outline-none"
              />
            </div>
            <div className="mt-4">
              <p className="text-sm text-dark-400">
                Enviará diariamente às{' '}
                <span className="text-white font-mono font-bold">
                  {String(settings.dailyReportHour).padStart(2, '0')}:{String(settings.dailyReportMinute).padStart(2, '0')}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[{ h: 7, m: 0, label: '07:00' }, { h: 8, m: 0, label: '08:00' }, { h: 9, m: 0, label: '09:00' }, { h: 20, m: 0, label: '20:00' }, { h: 22, m: 0, label: '22:00' }].map(opt => (
              <button
                key={opt.label}
                onClick={() => updateLocal({ dailyReportHour: opt.h, dailyReportMinute: opt.m })}
                className={clsx(
                  'px-3 py-1 rounded text-xs transition-colors',
                  settings.dailyReportHour === opt.h && settings.dailyReportMinute === opt.m
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-700 hover:bg-dark-600'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Save Button (bottom) */}
      {hasUnsavedChanges && (
        <div className="sticky bottom-4">
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 shadow-lg"
          >
            {updateMutation.isPending ? <RefreshCw className="w-5 h-5 animate-spin" /> : null}
            Salvar Configurações
          </button>
        </div>
      )}
    </div>
  );
}

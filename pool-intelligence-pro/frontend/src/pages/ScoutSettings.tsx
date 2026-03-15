import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { defaultRiskConfig } from '@/data/constants';
import { useRiskConfig } from '@/hooks/useRiskConfig';
import type { RiskConfig } from '@/types/pool';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  Shield,
  Network,
  Coins,
  Save,
  RotateCcw,
  MessageSquare,
  Loader2,
  Send,
  Bell,
  Zap,
  RefreshCw,
  Check,
  X,
  Link,
  Clock,
  Filter,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useI18n, type Locale } from '@/i18n';
import { useTheme } from 'next-themes';
import {
  fetchSettings,
  updateNotificationSettings,
  updateTelegramConfig,
  testTelegramConnection,
  testTelegramRecommendations,
  sendPortfolioReport,
  NotificationSettings,
} from '@/api/client';

interface NotificationOption {
  key: keyof NotificationSettings['notifications'];
  label: string;
  description: string;
  emoji: string;
}

const NOTIFICATION_OPTIONS: NotificationOption[] = [
  { key: 'rangeExit', label: 'Saida do Range', description: 'Alerta quando o preco sai do range configurado', emoji: '🚨' },
  { key: 'nearRangeExit', label: 'Proximo do Limite', description: 'Alerta quando o preco se aproxima do limite do range', emoji: '⚠️' },
  { key: 'dailyReport', label: 'Relatorio Diario', description: 'Resumo diario de todas as posicoes com analise IA', emoji: '📊' },
  { key: 'newRecommendation', label: 'Nova Recomendacao', description: 'Quando a IA detecta uma nova oportunidade de alto score', emoji: '🏆' },
  { key: 'priceAlerts', label: 'Alertas de Preco', description: 'Alertas configurados de preco acima/abaixo de thresholds', emoji: '📈' },
  { key: 'systemAlerts', label: 'Alertas do Sistema', description: 'Notificacoes de saude do sistema e provedores de dados', emoji: '🔧' },
];

export default function ScoutSettings() {
  const { config: savedConfig, loading: configLoading, saveConfig } = useRiskConfig();
  const [config, setConfig] = useState<RiskConfig>(defaultRiskConfig);

  // Telegram state
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [telegramHasBot, setTelegramHasBot] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [reportStatus, setReportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [recTestStatus, setRecTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [recTestMessage, setRecTestMessage] = useState('');

  // Telegram config management
  const [botTokenInput, setBotTokenInput] = useState('');
  const [chatIdInput, setChatIdInput] = useState('');
  const [telegramSaving, setTelegramSaving] = useState(false);

  // Notification settings
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [localNotifChanges, setLocalNotifChanges] = useState<Partial<NotificationSettings> | null>(null);
  const [notifSaving, setNotifSaving] = useState(false);
  const [newToken, setNewToken] = useState('');

  useEffect(() => {
    if (!configLoading && savedConfig) {
      setConfig(savedConfig);
    }
  }, [savedConfig, configLoading]);

  // Fetch Telegram status + notification settings from backend
  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await fetchSettings();
        setTelegramEnabled(settings.telegram?.enabled || false);
        setTelegramChatId(settings.telegram?.chatId || null);
        setTelegramHasBot(settings.telegram?.hasBot || false);
        setNotifSettings(settings.notifications || null);
      } catch {
        setTelegramEnabled(false);
        setTelegramChatId(null);
      } finally {
        setTelegramLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Merged notification settings (base + local changes)
  const defaultNotif: NotificationSettings = {
    appUrl: '',
    notifications: { rangeExit: true, nearRangeExit: true, dailyReport: true, newRecommendation: false, priceAlerts: true, systemAlerts: false },
    dailyReportHour: 8,
    dailyReportMinute: 0,
    tokenFilters: [],
  };
  const baseNotif = notifSettings ?? defaultNotif;
  const mergedNotif: NotificationSettings = localNotifChanges
    ? {
        ...baseNotif,
        appUrl: localNotifChanges.appUrl ?? baseNotif.appUrl,
        dailyReportHour: localNotifChanges.dailyReportHour ?? baseNotif.dailyReportHour,
        dailyReportMinute: localNotifChanges.dailyReportMinute ?? baseNotif.dailyReportMinute,
        tokenFilters: localNotifChanges.tokenFilters ?? baseNotif.tokenFilters ?? [],
        notifications: {
          rangeExit: localNotifChanges.notifications?.rangeExit ?? baseNotif.notifications.rangeExit,
          nearRangeExit: localNotifChanges.notifications?.nearRangeExit ?? baseNotif.notifications.nearRangeExit,
          dailyReport: localNotifChanges.notifications?.dailyReport ?? baseNotif.notifications.dailyReport,
          newRecommendation: localNotifChanges.notifications?.newRecommendation ?? baseNotif.notifications.newRecommendation,
          priceAlerts: localNotifChanges.notifications?.priceAlerts ?? baseNotif.notifications.priceAlerts,
          systemAlerts: localNotifChanges.notifications?.systemAlerts ?? baseNotif.notifications.systemAlerts,
        },
      }
    : baseNotif;

  function updateLocalNotif(partial: Partial<NotificationSettings>) {
    setLocalNotifChanges(prev => ({ ...(prev ?? {}), ...partial }));
  }

  function toggleNotification(key: keyof NotificationSettings['notifications'], value: boolean) {
    updateLocalNotif({ notifications: { ...mergedNotif.notifications, [key]: value } });
  }

  async function handleSaveNotifications() {
    if (!localNotifChanges) return;
    setNotifSaving(true);
    try {
      const updated = await updateNotificationSettings(localNotifChanges);
      setNotifSettings(updated);
      setLocalNotifChanges(null);
      toast.success('Configuracoes de notificacao salvas!');
    } catch {
      toast.error('Falha ao salvar configuracoes de notificacao');
    } finally {
      setNotifSaving(false);
    }
  }

  // Telegram config handlers
  async function handleSaveTelegram() {
    const token = botTokenInput.trim();
    const chatId = chatIdInput.trim();
    if (!token && !chatId) return;
    setTelegramSaving(true);
    try {
      const params: { botToken?: string; chatId?: string } = {};
      if (token) params.botToken = token;
      if (chatId) params.chatId = chatId;
      const result = await updateTelegramConfig(params);
      setTelegramEnabled(result.enabled);
      setTelegramChatId(result.chatId);
      setTelegramHasBot(result.hasBot);
      if (token) setBotTokenInput('');
      if (chatId) setChatIdInput('');
      toast.success(result.enabled
        ? 'Telegram configurado e pronto para enviar!'
        : 'Configuracao salva. Configure o Bot Token e Chat ID para ativar.');

      // Reload full settings to sync state
      try {
        const settings = await fetchSettings();
        setTelegramEnabled(settings.telegram?.enabled || false);
        setTelegramChatId(settings.telegram?.chatId || null);
        setTelegramHasBot(settings.telegram?.hasBot || false);
      } catch { /* ignore reload error */ }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Falha ao configurar Telegram';
      toast.error(msg);
    } finally {
      setTelegramSaving(false);
    }
  }

  async function handleRemoveTelegram() {
    setTelegramSaving(true);
    try {
      const result = await updateTelegramConfig({ botToken: '', chatId: '' });
      setTelegramEnabled(result.enabled);
      setTelegramChatId(result.chatId);
      setTelegramHasBot(result.hasBot);
      toast.success('Telegram desconectado');
    } catch {
      toast.error('Falha ao desconectar Telegram');
    } finally {
      setTelegramSaving(false);
    }
  }

  // Token filter handlers
  function handleAddToken() {
    const token = newToken.trim().toUpperCase();
    if (!token) return;
    const current = mergedNotif.tokenFilters || [];
    if (!current.includes(token)) {
      updateLocalNotif({ tokenFilters: [...current, token] });
    }
    setNewToken('');
  }

  function handleRemoveToken(token: string) {
    const current = mergedNotif.tokenFilters || [];
    updateLocalNotif({ tokenFilters: current.filter(t => t !== token) });
  }

  async function handleTestTelegram() {
    setTestStatus('loading');
    try {
      const result = await testTelegramConnection();
      if (result.success) {
        setTestStatus('success');
        toast.success(result.message || 'Mensagem de teste enviada! Verifique seu Telegram.');
      } else {
        setTestStatus('error');
        toast.error(result.error || 'Falha ao enviar teste');
      }
    } catch (err: any) {
      setTestStatus('error');
      // Extract detailed error from different response formats
      const msg = err?.response?.data?.error || err?.message || 'Falha ao conectar com o servidor';
      toast.error(msg);
    }
    setTimeout(() => setTestStatus('idle'), 5000);
  }

  async function handleSendReport() {
    setReportStatus('loading');
    try {
      await sendPortfolioReport();
      setReportStatus('success');
      toast.success('Relatorio enviado ao Telegram!');
    } catch {
      setReportStatus('error');
      toast.error('Falha ao enviar relatorio');
    }
    setTimeout(() => setReportStatus('idle'), 3000);
  }

  async function handleTestRecommendations() {
    setRecTestStatus('loading');
    setRecTestMessage('');
    try {
      const result = await testTelegramRecommendations(5, true);
      if (result.success) {
        setRecTestStatus('success');
        setRecTestMessage(result.message || `Enviado ${result.count} recomendacoes`);
      } else {
        setRecTestStatus('error');
        setRecTestMessage(result.error || 'Falha ao enviar recomendacoes');
      }
    } catch {
      setRecTestStatus('error');
      setRecTestMessage('Erro de conexao com o servidor');
    }
    setTimeout(() => setRecTestStatus('idle'), 5000);
  }

  const profiles = [
    { id: 'defensive', name: 'Defensivo', desc: 'Prioriza preservacao de capital', color: 'border-success bg-success/10 text-success' },
    { id: 'normal', name: 'Normal', desc: 'Equilibrio entre risco e retorno', color: 'border-primary bg-primary/10 text-primary' },
    { id: 'aggressive', name: 'Agressivo', desc: 'Maximiza retorno, aceita mais risco', color: 'border-destructive bg-destructive/10 text-destructive' },
  ];

  const networks = ['Ethereum', 'Arbitrum', 'Optimism', 'Base', 'Polygon', 'BNB Chain'];
  const dexs = ['Uniswap V3', 'Velodrome', 'Aerodrome', 'Curve', 'Balancer', 'SushiSwap'];

  const handleSave = async () => {
    try {
      await saveConfig(config);
    } catch {
      // Error handled in hook
    }
  };

  const handleReset = () => {
    setConfig(defaultRiskConfig);
    toast.info('Configuracoes restauradas');
  };

  const hasNotifChanges = localNotifChanges !== null;

  if (configLoading) {
    return (
      <MainLayout title="Configuracoes" subtitle="Configure sua banca, perfil de risco e preferencias">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Carregando configuracoes...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Configuracoes"
      subtitle="Configure sua banca, perfil de risco e preferencias"
    >
      <div className="max-w-4xl space-y-6">
        {/* Language & Theme */}
        <LanguageThemeSettings />

        {/* Banca Total */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Banca Total</h2>
              <p className="text-sm text-muted-foreground">Capital disponivel para prover liquidez</p>
            </div>
          </div>

          <div className="max-w-xs">
            <Label htmlFor="banca">Valor em USDT</Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="banca"
                type="number"
                value={config.totalBanca}
                onChange={(e) => setConfig({ ...config, totalBanca: parseFloat(e.target.value) || 0 })}
                className="pl-7 font-mono text-lg"
              />
            </div>
          </div>
        </div>

        {/* Risk Profile */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Perfil de Risco</h2>
              <p className="text-sm text-muted-foreground">Define como a IA seleciona e sugere pools</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setConfig({ ...config, profile: profile.id as RiskConfig['profile'] })}
                className={cn(
                  'p-4 rounded-lg border-2 transition-all text-left',
                  config.profile === profile.id
                    ? profile.color
                    : 'border-border hover:border-border/80'
                )}
              >
                <p className="font-medium">{profile.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{profile.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Limits */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Limites Globais</h2>
              <p className="text-sm text-muted-foreground">Protecoes automaticas para seu capital</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Maximo por pool</Label>
                <span className="font-mono text-sm">{config.maxPerPool}%</span>
              </div>
              <Slider
                value={[config.maxPerPool]}
                onValueChange={([value]) => setConfig({ ...config, maxPerPool: value })}
                max={20}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Maximo por rede</Label>
                <span className="font-mono text-sm">{config.maxPerNetwork}%</span>
              </div>
              <Slider
                value={[config.maxPerNetwork]}
                onValueChange={([value]) => setConfig({ ...config, maxPerNetwork: value })}
                max={50}
                step={5}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Maximo em pools volateis</Label>
                <span className="font-mono text-sm">{config.maxVolatile}%</span>
              </div>
              <Slider
                value={[config.maxVolatile]}
                onValueChange={([value]) => setConfig({ ...config, maxVolatile: value })}
                max={50}
                step={5}
              />
            </div>
          </div>
        </div>

        {/* Networks */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Network className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Redes Permitidas</h2>
              <p className="text-sm text-muted-foreground">Selecione em quais redes operar</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {networks.map((network) => {
              const isActive = config.allowedNetworks.includes(network);
              return (
                <Badge
                  key={network}
                  variant={isActive ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-all px-3 py-1.5',
                    isActive && 'bg-primary hover:bg-primary/90'
                  )}
                  onClick={() => {
                    if (isActive) {
                      setConfig({
                        ...config,
                        allowedNetworks: config.allowedNetworks.filter((n) => n !== network),
                      });
                    } else {
                      setConfig({
                        ...config,
                        allowedNetworks: [...config.allowedNetworks, network],
                      });
                    }
                  }}
                >
                  {network}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* DEXs */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">DEXs Permitidas</h2>
              <p className="text-sm text-muted-foreground">Selecione em quais DEXs operar</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {dexs.map((dex) => {
              const isActive = config.allowedDexs.includes(dex);
              return (
                <Badge
                  key={dex}
                  variant={isActive ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-all px-3 py-1.5',
                    isActive && 'bg-primary hover:bg-primary/90'
                  )}
                  onClick={() => {
                    if (isActive) {
                      setConfig({
                        ...config,
                        allowedDexs: config.allowedDexs.filter((d) => d !== dex),
                      });
                    } else {
                      setConfig({
                        ...config,
                        allowedDexs: [...config.allowedDexs, dex],
                      });
                    }
                  }}
                >
                  {dex}
                </Badge>
              );
            })}
          </div>

          {/* Exclude Memecoins */}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
            <div>
              <Label>Excluir memecoins</Label>
              <p className="text-sm text-muted-foreground">
                Ignora tokens de alto risco e volatilidade extrema
              </p>
            </div>
            <Switch
              checked={config.excludeMemecoins}
              onCheckedChange={(checked) => setConfig({ ...config, excludeMemecoins: checked })}
            />
          </div>
        </div>

        {/* ============================================ */}
        {/* TELEGRAM SECTION */}
        {/* ============================================ */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Telegram</h2>
              <p className="text-sm text-muted-foreground">Receba alertas e relatorios em tempo real</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-medium">Status da Integracao</p>
              <p className="text-sm text-muted-foreground">
                {telegramLoading
                  ? 'Verificando...'
                  : telegramEnabled
                    ? `Conectado - Chat ID: ${telegramChatId}`
                    : !telegramHasBot
                      ? 'Adicione o Bot Token e Chat ID abaixo para conectar.'
                      : 'Bot conectado. Adicione o Chat ID abaixo.'
                }
              </p>
            </div>
            <Badge variant={telegramEnabled ? 'default' : 'destructive'} className={cn(
              telegramEnabled ? 'bg-success hover:bg-success/90' : ''
            )}>
              {telegramEnabled ? 'Conectado' : 'Desconectado'}
            </Badge>
          </div>

          {/* Bot Token + Chat ID Management */}
          <div className="mb-4 p-4 rounded-lg bg-secondary/30 border border-border space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Bot Token</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Crie um bot com @BotFather no Telegram e cole o token aqui.
              </p>
              <Input
                type="password"
                value={botTokenInput}
                onChange={e => setBotTokenInput(e.target.value)}
                placeholder={telegramHasBot ? 'Bot configurado (cole novo token para alterar)' : 'Cole o token do BotFather (ex: 123456:ABC-DEF...)'}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Chat ID</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Envie /start para @userinfobot no Telegram para descobrir seu ID.
              </p>
              <Input
                type="text"
                value={chatIdInput}
                onChange={e => setChatIdInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveTelegram()}
                placeholder={telegramChatId ? `Atual: ${telegramChatId}` : 'Digite seu Chat ID (ex: 123456789)'}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveTelegram}
                disabled={(!botTokenInput.trim() && !chatIdInput.trim()) || telegramSaving}
                className="flex-1"
              >
                {telegramSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar e Conectar
              </Button>
              {(telegramHasBot || telegramChatId) && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleRemoveTelegram}
                  disabled={telegramSaving}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Desconectar
                </Button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestTelegram}
              disabled={testStatus === 'loading' || !telegramEnabled}
              className={cn(
                testStatus === 'success' && 'border-success text-success',
                testStatus === 'error' && 'border-destructive text-destructive'
              )}
            >
              {testStatus === 'loading' ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> :
               testStatus === 'success' ? <Check className="h-4 w-4 mr-2" /> :
               testStatus === 'error' ? <X className="h-4 w-4 mr-2" /> :
               <Send className="h-4 w-4 mr-2" />}
              {testStatus === 'success' ? 'Enviado!' :
               testStatus === 'error' ? 'Falhou' :
               'Testar Conexao'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSendReport}
              disabled={reportStatus === 'loading' || !telegramEnabled}
              className={cn(
                reportStatus === 'success' && 'border-success text-success',
                reportStatus === 'error' && 'border-destructive text-destructive'
              )}
            >
              {reportStatus === 'loading' ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> :
               reportStatus === 'success' ? <Check className="h-4 w-4 mr-2" /> :
               reportStatus === 'error' ? <X className="h-4 w-4 mr-2" /> :
               <Bell className="h-4 w-4 mr-2" />}
              {reportStatus === 'success' ? 'Enviado!' :
               reportStatus === 'error' ? 'Falhou' :
               'Enviar Relatorio Agora'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTestRecommendations}
              disabled={recTestStatus === 'loading' || !telegramEnabled}
              className={cn(
                recTestStatus === 'success' && 'border-success text-success',
                recTestStatus === 'error' && 'border-destructive text-destructive'
              )}
            >
              {recTestStatus === 'loading' ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> :
               recTestStatus === 'success' ? <Check className="h-4 w-4 mr-2" /> :
               recTestStatus === 'error' ? <X className="h-4 w-4 mr-2" /> :
               <Zap className="h-4 w-4 mr-2" />}
              {recTestStatus === 'success' ? 'Enviado!' :
               recTestStatus === 'error' ? 'Falhou' :
               'Testar Recomendacoes'}
            </Button>
          </div>

          {/* Recommendations test result message */}
          {recTestMessage && (
            <div className={cn(
              'p-3 rounded-lg text-sm mb-4',
              recTestStatus === 'error'
                ? 'bg-destructive/10 border border-destructive/30 text-destructive'
                : 'bg-success/10 border border-success/30 text-success'
            )}>
              {recTestMessage}
            </div>
          )}

          {/* Setup instructions — always visible when not fully configured */}
          {!telegramEnabled && !telegramLoading && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-sm text-primary">
              <p className="font-medium mb-1">Como configurar:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                <li>Abra o Telegram e busque por <strong>@BotFather</strong></li>
                <li>Envie <code className="bg-secondary px-1 py-0.5 rounded">/newbot</code> e siga as instrucoes</li>
                <li>Copie o <strong>token</strong> gerado e cole no campo "Bot Token" acima</li>
                <li>Busque por <strong>@userinfobot</strong> e envie <code className="bg-secondary px-1 py-0.5 rounded">/start</code> para descobrir seu Chat ID</li>
                <li>Cole seu <strong>Chat ID</strong> no campo acima</li>
                <li className="text-yellow-600 font-semibold">IMPORTANTE: Abra o seu bot no Telegram e envie <code className="bg-secondary px-1 py-0.5 rounded">/start</code> para ele. Sem isso, o bot NAO consegue enviar mensagens para voce!</li>
              </ol>
            </div>
          )}
          {/* Reminder about /start even when bot is configured but not enabled */}
          {telegramHasBot && !telegramEnabled && !telegramLoading && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-600 mt-2">
              <strong>Dica:</strong> Se voce configurou tudo mas nao recebe mensagens, abra o Telegram, busque seu bot e envie <code className="bg-secondary px-1 py-0.5 rounded">/start</code>. O bot so pode enviar mensagens depois que voce iniciar a conversa.
            </div>
          )}
        </div>

        {/* ============================================ */}
        {/* NOTIFICATION TYPES */}
        {/* ============================================ */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Tipos de Notificacao</h2>
              <p className="text-sm text-muted-foreground">Escolha quais alertas receber no Telegram</p>
            </div>
          </div>

          <div className="space-y-1">
            {NOTIFICATION_OPTIONS.map((option) => (
              <div key={option.key} className="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-secondary/30 transition-colors">
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2">
                    <span>{option.emoji}</span>
                    <span className="font-medium text-sm">{option.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-7">{option.description}</p>
                </div>
                <Switch
                  checked={mergedNotif.notifications[option.key]}
                  onCheckedChange={(v) => toggleNotification(option.key, v)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ============================================ */}
        {/* TOKEN FILTERS */}
        {/* ============================================ */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Filter className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Filtro de Tokens</h2>
              <p className="text-sm text-muted-foreground">Filtre recomendacoes para pools com tokens especificos</p>
            </div>
          </div>

          {/* Current tokens */}
          <div className="flex flex-wrap gap-2 mb-4">
            {(mergedNotif.tokenFilters || []).length === 0 ? (
              <span className="text-muted-foreground text-sm italic">Nenhum filtro ativo — mostrando todas as pools</span>
            ) : (
              (mergedNotif.tokenFilters || []).map(token => (
                <Badge
                  key={token}
                  variant="outline"
                  className="cursor-pointer px-3 py-1 bg-primary/10 border-primary/30 text-primary hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
                  onClick={() => handleRemoveToken(token)}
                >
                  {token}
                  <Trash2 className="h-3 w-3 ml-1.5" />
                </Badge>
              ))
            )}
          </div>

          {/* Add token */}
          <div className="flex gap-2 mb-3">
            <Input
              type="text"
              value={newToken}
              onChange={e => setNewToken(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddToken()}
              placeholder="Simbolo do token (ex: ETH, USDC, WBTC)"
              className="font-mono uppercase text-sm"
            />
            <Button
              size="sm"
              onClick={handleAddToken}
              disabled={!newToken.trim()}
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>

          {/* Quick add */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground mr-1 self-center">Rapido:</span>
            {['ETH', 'WETH', 'USDC', 'USDT', 'WBTC', 'DAI', 'ARB', 'OP'].map(token => (
              <Badge
                key={token}
                variant="outline"
                className={cn(
                  'cursor-pointer text-xs px-2 py-0.5 transition-colors',
                  (mergedNotif.tokenFilters || []).includes(token)
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-primary/10 hover:border-primary/30'
                )}
                onClick={() => {
                  const current = mergedNotif.tokenFilters || [];
                  if (!current.includes(token)) {
                    updateLocalNotif({ tokenFilters: [...current, token] });
                  }
                }}
              >
                {token}
              </Badge>
            ))}
          </div>
        </div>

        {/* ============================================ */}
        {/* DAILY REPORT SCHEDULE */}
        {/* ============================================ */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Horario do Relatorio Diario</h2>
              <p className="text-sm text-muted-foreground">Hora em que o relatorio sera enviado (hora do servidor)</p>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Hora</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={mergedNotif.dailyReportHour}
                onChange={e => updateLocalNotif({ dailyReportHour: parseInt(e.target.value) || 0 })}
                className="w-20 text-center font-mono"
              />
            </div>
            <span className="text-2xl text-muted-foreground mt-4">:</span>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Minuto</Label>
              <Input
                type="number"
                min={0}
                max={59}
                value={mergedNotif.dailyReportMinute}
                onChange={e => updateLocalNotif({ dailyReportMinute: parseInt(e.target.value) || 0 })}
                className="w-20 text-center font-mono"
              />
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">
                Envio diario as{' '}
                <span className="text-foreground font-mono font-bold">
                  {String(mergedNotif.dailyReportHour).padStart(2, '0')}:{String(mergedNotif.dailyReportMinute).padStart(2, '0')}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[{ h: 7, m: 0, label: '07:00' }, { h: 8, m: 0, label: '08:00' }, { h: 9, m: 0, label: '09:00' }, { h: 20, m: 0, label: '20:00' }, { h: 22, m: 0, label: '22:00' }].map(opt => (
              <Badge
                key={opt.label}
                variant="outline"
                className={cn(
                  'cursor-pointer px-3 py-1 transition-colors',
                  mergedNotif.dailyReportHour === opt.h && mergedNotif.dailyReportMinute === opt.m
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-secondary'
                )}
                onClick={() => updateLocalNotif({ dailyReportHour: opt.h, dailyReportMinute: opt.m })}
              >
                {opt.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* ============================================ */}
        {/* APP URL */}
        {/* ============================================ */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Link className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">URL do Aplicativo</h2>
              <p className="text-sm text-muted-foreground">URL base para links nas mensagens do Telegram</p>
            </div>
          </div>

          <Input
            type="url"
            value={mergedNotif.appUrl}
            onChange={e => updateLocalNotif({ appUrl: e.target.value })}
            placeholder="https://pool2026prm.onrender.com"
            className="font-mono text-sm mb-2"
          />
          <p className="text-xs text-muted-foreground">
            Links gerados: <code className="text-foreground">{mergedNotif.appUrl || 'http://localhost:5173'}/positions</code>
          </p>
        </div>

        {/* ============================================ */}
        {/* SAVE NOTIFICATION SETTINGS (sticky) */}
        {/* ============================================ */}
        {hasNotifChanges && (
          <div className="sticky bottom-4 z-10">
            <Button
              onClick={handleSaveNotifications}
              disabled={notifSaving}
              className="w-full"
              variant="glow"
            >
              {notifSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Configuracoes de Notificacao
            </Button>
          </div>
        )}

        {/* Save Risk Config Actions */}
        <div className="flex gap-4">
          <Button onClick={handleSave} className="flex-1" variant="glow">
            <Save className="h-4 w-4 mr-2" />
            Salvar Configuracoes de Risco
          </Button>
          <Button onClick={handleReset} variant="outline">
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar Padroes
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}

function LanguageThemeSettings() {
  const { locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Aparencia</h2>
          <p className="text-sm text-muted-foreground">Idioma e tema do aplicativo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Language */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Idioma / Language</Label>
          <div className="flex gap-2">
            {([
              { value: 'pt-BR' as Locale, label: 'Portugues', flag: 'BR' },
              { value: 'en-US' as Locale, label: 'English', flag: 'US' },
            ]).map(lang => (
              <button
                key={lang.value}
                onClick={() => setLocale(lang.value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors text-sm',
                  locale === lang.value
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border hover:bg-secondary/50'
                )}
              >
                <span className="font-mono text-xs text-muted-foreground">{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Tema / Theme</Label>
          <div className="flex gap-2">
            {([
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]).map(t => (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors text-sm',
                  theme === t.value
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border hover:bg-secondary/50'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

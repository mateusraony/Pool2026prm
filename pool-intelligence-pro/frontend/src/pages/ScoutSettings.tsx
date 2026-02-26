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
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  fetchSettings,
  testTelegramConnection,
  testTelegramRecommendations,
  sendPortfolioReport,
} from '@/api/client';

export default function ScoutSettings() {
  const { config: savedConfig, loading: configLoading, saveConfig } = useRiskConfig();
  const [config, setConfig] = useState<RiskConfig>(defaultRiskConfig);

  // Telegram state
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [reportStatus, setReportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [recTestStatus, setRecTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [recTestMessage, setRecTestMessage] = useState('');

  useEffect(() => {
    if (!configLoading && savedConfig) {
      setConfig(savedConfig);
    }
  }, [savedConfig, configLoading]);

  // Fetch Telegram status from backend
  useEffect(() => {
    async function loadTelegramStatus() {
      try {
        const settings = await fetchSettings();
        setTelegramEnabled(settings.telegram?.enabled || false);
        setTelegramChatId(settings.telegram?.chatId || null);
      } catch {
        setTelegramEnabled(false);
        setTelegramChatId(null);
      } finally {
        setTelegramLoading(false);
      }
    }
    loadTelegramStatus();
  }, []);

  async function handleTestTelegram() {
    setTestStatus('loading');
    try {
      const result = await testTelegramConnection();
      setTestStatus(result.success ? 'success' : 'error');
      toast[result.success ? 'success' : 'error'](
        result.success ? 'Mensagem de teste enviada!' : 'Falha ao enviar teste'
      );
    } catch {
      setTestStatus('error');
      toast.error('Falha ao conectar com Telegram');
    }
    setTimeout(() => setTestStatus('idle'), 3000);
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
    {
      id: 'defensive',
      name: 'Defensivo',
      desc: 'Prioriza preservacao de capital',
      color: 'border-success bg-success/10 text-success'
    },
    {
      id: 'normal',
      name: 'Normal',
      desc: 'Equilibrio entre risco e retorno',
      color: 'border-primary bg-primary/10 text-primary'
    },
    {
      id: 'aggressive',
      name: 'Agressivo',
      desc: 'Maximiza retorno, aceita mais risco',
      color: 'border-destructive bg-destructive/10 text-destructive'
    },
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

        {/* Telegram */}
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
                  : telegramChatId
                    ? `Chat ID: ${telegramChatId}`
                    : 'Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env do backend'
                }
              </p>
            </div>
            <Badge variant={telegramEnabled ? 'default' : 'destructive'} className={cn(
              telegramEnabled ? 'bg-success hover:bg-success/90' : ''
            )}>
              {telegramEnabled ? 'Conectado' : 'Desconectado'}
            </Badge>
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

          {/* Setup instructions when not configured */}
          {!telegramEnabled && !telegramLoading && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
              Para ativar o Telegram, adicione{' '}
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">TELEGRAM_BOT_TOKEN</code>{' '}
              e{' '}
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">TELEGRAM_CHAT_ID</code>{' '}
              no arquivo <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">.env</code> do backend.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <Button onClick={handleSave} className="flex-1" variant="glow">
            <Save className="h-4 w-4 mr-2" />
            Salvar Configuracoes
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

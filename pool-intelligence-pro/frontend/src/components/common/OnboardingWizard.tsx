import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Wallet, TrendingUp, Shield, BarChart3, Bell,
  ArrowRight, ArrowLeft, Check, Sparkles,
} from 'lucide-react';

const ONBOARDING_KEY = 'pool-intel-onboarding-done';

interface OnboardingStep {
  title: string;
  description: string;
  icon: typeof Wallet;
  detail: string;
  action?: { label: string; path: string };
}

const STEPS: OnboardingStep[] = [
  {
    title: 'Bem-vindo ao Pool Intelligence Pro',
    description: 'Seu sistema de inteligencia para pools de liquidez DeFi.',
    icon: Sparkles,
    detail: 'O Pool Intelligence Pro monitora, analisa e recomenda as melhores pools de liquidez em Ethereum, Arbitrum, Base e Polygon. Vamos configurar tudo em 5 passos rapidos.',
  },
  {
    title: 'Configure sua Banca',
    description: 'Defina o capital total disponivel para operar.',
    icon: Wallet,
    detail: 'Sua banca e o capital total que voce tem para prover liquidez. O sistema usa esse valor para calcular alocacoes, risco maximo por pool e exposicao por rede. Voce pode ajustar a qualquer momento em Configuracoes.',
    action: { label: 'Ir para Configuracoes', path: '/scout-settings' },
  },
  {
    title: 'Explore as Recomendacoes',
    description: 'A IA analisa centenas de pools e recomenda as melhores.',
    icon: TrendingUp,
    detail: 'O Radar escaneia pools a cada 5 minutos, calcula Health Score (0-100), APR risk-adjusted, volatilidade e IL estimado. As melhores pools aparecem na pagina Recomendadas, ranqueadas pelo algoritmo institucional.',
    action: { label: 'Ver Recomendadas', path: '/recommended' },
  },
  {
    title: 'Monitore suas Posicoes',
    description: 'Adicione posicoes e acompanhe P&L em tempo real.',
    icon: Shield,
    detail: 'Quando encontrar uma boa pool, abra os detalhes e use "Monitorar Range" para registrar sua posicao. O sistema calcula fees acumuladas, IL, PnL e alerta quando o preco se aproxima do limite do range.',
    action: { label: 'Ver Pools Ativas', path: '/active' },
  },
  {
    title: 'Analytics Avancado',
    description: 'Monte Carlo, Backtest, LVR e Portfolio Intelligence.',
    icon: BarChart3,
    detail: 'Cada pool tem analytics institucionais: simulacao Monte Carlo com milhares de cenarios, backtesting historico, analise LVR e correlacao de tokens. O Portfolio agrega Sharpe Ratio, diversificacao e APR risk-adjusted.',
    action: { label: 'Ver Portfolio', path: '/portfolio' },
  },
];

export function OnboardingWizard() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (!done) {
      setIsOpen(true);
    }
  }, []);

  if (!isOpen) return null;

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;
  const Icon = currentStep.icon;

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOpen(false);
  };

  const handleAction = () => {
    if (currentStep.action) {
      handleComplete();
      navigate(currentStep.action.path);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="glass-card w-full max-w-lg mx-4 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-8">
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-2 h-2 rounded-full transition-colors',
                    i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-secondary'
                  )}
                />
              ))}
            </div>
            <button
              onClick={handleComplete}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Pular tutorial
            </button>
          </div>

          {/* Content */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <Icon className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{currentStep.title}</h2>
            <p className="text-muted-foreground mb-4">{currentStep.description}</p>
            <p className="text-sm text-muted-foreground/80 leading-relaxed">
              {currentStep.detail}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(s => s - 1)}
              disabled={isFirst}
              className={cn(isFirst && 'invisible')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>

            <div className="flex gap-2">
              {currentStep.action && (
                <Button variant="outline" size="sm" onClick={handleAction}>
                  {currentStep.action.label}
                </Button>
              )}

              {isLast ? (
                <Button size="sm" onClick={handleComplete}>
                  <Check className="h-4 w-4 mr-1" />
                  Comecar
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep(s => s + 1)}>
                  Proximo
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hook to reset onboarding (useful in settings) */
export function useOnboarding() {
  return {
    reset: () => localStorage.removeItem(ONBOARDING_KEY),
    isDone: () => localStorage.getItem(ONBOARDING_KEY) === 'true',
  };
}

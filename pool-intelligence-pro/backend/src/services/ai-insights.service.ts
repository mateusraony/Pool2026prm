/**
 * AI Insights Service — ETAPA 17
 * Gera análises em linguagem natural de pools DeFi.
 * Usa Claude API se ANTHROPIC_API_KEY estiver disponível,
 * caso contrário usa análise rule-based determinística.
 */

import { logService } from './log.service.js';
import { cacheService } from './cache.service.js';
import { Pool, Score } from '../types/index.js';

export interface PoolInsight {
  summary: string;
  recommendation: string;
  keyRisks: string[];
  opportunities: string[];
  confidence: 'high' | 'medium' | 'low';
  generatedBy: 'claude' | 'rule-based';
  generatedAt: Date;
}

// ============================================================
// RULE-BASED ANALYSIS (fallback sem API key)
// ============================================================

function classifyApr(apr: number): string {
  if (apr >= 100) return 'muito alto (>100% APR)';
  if (apr >= 50) return 'alto (50-100% APR)';
  if (apr >= 20) return 'moderado (20-50% APR)';
  if (apr >= 5) return 'baixo (5-20% APR)';
  return 'muito baixo (<5% APR)';
}

function classifyTvl(tvl: number): string {
  if (tvl >= 100_000_000) return 'muito alta (>$100M)';
  if (tvl >= 10_000_000) return 'alta ($10M-$100M)';
  if (tvl >= 1_000_000) return 'moderada ($1M-$10M)';
  if (tvl >= 100_000) return 'baixa ($100k-$1M)';
  return 'muito baixa (<$100k)';
}

function classifyVolatility(vol: number): string {
  if (vol >= 0.05) return 'muito alta';
  if (vol >= 0.02) return 'alta';
  if (vol >= 0.01) return 'moderada';
  return 'baixa';
}

function generateRuleBasedInsight(pool: Pool, score?: Score): PoolInsight {
  const pair = `${pool.token0?.symbol ?? '?'}/${pool.token1?.symbol ?? '?'}`;
  const apr = pool.apr ?? 0;
  const tvl = pool.tvl ?? 0;
  const vol24h = pool.volume24h ?? 0;
  const volatility = pool.volatilityAnn ?? 0;
  const scoreTotal = score?.total ?? 0;
  const feeTier = pool.feeTier ?? 0;

  const isStablePair = pair.includes('USD') || pair.includes('DAI') || pair.includes('USDC') || pair.includes('USDT');
  const isWrappedPair = pair.includes('WETH') && pair.includes('ETH');
  const volTvlRatio = tvl > 0 ? vol24h / tvl : 0;

  // --- Riscos ---
  const risks: string[] = [];

  if (tvl < 100_000) risks.push('Liquidez muito baixa — risco elevado de slippage e dificuldade de saída');
  if (apr > 200) risks.push('APR extremamente alto pode indicar emissões insustentáveis ou risco de rugpull');
  if (volatility > 0.05) risks.push(`Volatilidade ${classifyVolatility(Math.abs(volatility))} eleva o risco de Impermanent Loss`);
  if (volTvlRatio < 0.01 && tvl > 1_000_000) risks.push('Volume baixo em relação ao TVL — liquidez subutilizada, fees reduzidas');
  if (feeTier >= 1) risks.push('Fee tier alta (≥1%) pode afastar traders e reduzir volume');
  if (scoreTotal < 40) risks.push('Score baixo — múltiplos fatores de risco identificados');
  if (!isStablePair && !isWrappedPair && volatility > 0.03) {
    risks.push('Par de ativos voláteis sem hedge — IL pode superar os fees coletados');
  }

  // --- Oportunidades ---
  const opportunities: string[] = [];

  if (volTvlRatio > 0.3) opportunities.push('Volume/TVL alto — pool muito ativa, fees elevadas para LPs');
  if (apr >= 20 && apr <= 100) opportunities.push(`APR ${classifyApr(apr)} com potencial de retorno atrativo`);
  if (tvl >= 10_000_000) opportunities.push('Alta liquidez proporciona entradas e saídas eficientes');
  if (isStablePair) opportunities.push('Par estável reduz risco de IL — adequado para capital conservador');
  if (scoreTotal >= 70) opportunities.push('Score elevado indica pool saudável com múltiplos fatores positivos');
  if (feeTier <= 0.05) opportunities.push('Fee tier baixa atrai alto volume — ideal para pares correlacionados');
  if (pool.chain === 'arbitrum' || pool.chain === 'base') {
    opportunities.push('L2 com taxas de gas baixas — rebalanceamento de posição mais econômico');
  }

  // --- Sumário ---
  const scoreLabel = scoreTotal >= 70 ? 'forte' : scoreTotal >= 50 ? 'moderado' : 'fraco';
  const liquidityLabel = classifyTvl(tvl);
  const aprLabel = classifyApr(apr);

  const summary = `${pair} (${pool.protocol ?? 'DEX'} · ${pool.chain}) apresenta score ${scoreLabel} (${scoreTotal.toFixed(0)}/100), ` +
    `liquidez ${liquidityLabel} e APR ${aprLabel}. ` +
    (isStablePair
      ? 'Par estável com IL minimizado.'
      : `Par volátil — Impermanent Loss é o principal risco para LPs.`);

  // --- Recomendação ---
  let recommendation: string;
  if (scoreTotal >= 70 && risks.length <= 1) {
    recommendation = `✅ Pool recomendada para alocação. ${apr >= 20 ? `APR de ${apr.toFixed(1)}% oferece retorno atrativo` : 'Perfil equilibrado entre risco e retorno'}. Considere alocar entre 5-15% do capital disponível.`;
  } else if (scoreTotal >= 50) {
    recommendation = `⚠️ Pool com potencial moderado. Monitore de perto e prefira posições menores (3-8% do capital). ${risks.length > 0 ? `Principal risco: ${risks[0]}` : ''}`;
  } else {
    recommendation = `🔴 Pool de alto risco. Evite alocação ou limite a posições muito pequenas para exploração. ${risks.length > 0 ? `Risco principal: ${risks[0]}` : 'Score abaixo do ideal.'}`;
  }

  const confidence: 'high' | 'medium' | 'low' =
    (scoreTotal >= 60 && tvl >= 1_000_000) ? 'high' :
    (scoreTotal >= 40 || tvl >= 100_000) ? 'medium' : 'low';

  return {
    summary,
    recommendation,
    keyRisks: risks.slice(0, 4),
    opportunities: opportunities.slice(0, 4),
    confidence,
    generatedBy: 'rule-based',
    generatedAt: new Date(),
  };
}

// ============================================================
// CLAUDE API ANALYSIS (quando ANTHROPIC_API_KEY está disponível)
// ============================================================

async function generateClaudeInsight(pool: Pool, score?: Score): Promise<PoolInsight | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    // Dynamic import para não falhar se SDK não estiver instalado
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const pair = `${pool.token0?.symbol ?? '?'}/${pool.token1?.symbol ?? '?'}`;
    const poolContext = JSON.stringify({
      pair,
      chain: pool.chain,
      protocol: pool.protocol,
      tvl: pool.tvl,
      apr: pool.apr,
      volume24h: pool.volume24h,
      feeTier: pool.feeTier,
      volatilityAnn: pool.volatilityAnn,
      score: score?.total,
      scoreBreakdown: score?.breakdown,
    }, null, 2);

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Analise este pool de liquidez DeFi e forneça insights em português brasileiro. Seja conciso e objetivo.

Dados do pool:
${poolContext}

Responda APENAS com um JSON válido no formato:
{
  "summary": "resumo em 2-3 frases",
  "recommendation": "recomendação clara com emoji (✅/⚠️/🔴)",
  "keyRisks": ["risco1", "risco2", "risco3"],
  "opportunities": ["oportunidade1", "oportunidade2"],
  "confidence": "high|medium|low"
}`,
      }],
    });

    const content = message.content[0];
    if (content.type !== 'text') return null;

    // Extract JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary ?? '',
      recommendation: parsed.recommendation ?? '',
      keyRisks: Array.isArray(parsed.keyRisks) ? parsed.keyRisks : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      confidence: (['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium') as 'high' | 'medium' | 'low',
      generatedBy: 'claude',
      generatedAt: new Date(),
    };
  } catch (err) {
    logService.warn('SYSTEM', 'Claude API insight failed, falling back to rule-based', { error: (err as Error)?.message });
    return null;
  }
}

// ============================================================
// PUBLIC API
// ============================================================

class AiInsightsService {
  async getInsight(pool: Pool, score?: Score): Promise<PoolInsight> {
    const cacheKey = `ai-insight:${pool.chain}:${pool.poolAddress}`;
    const cached = cacheService.get<PoolInsight>(cacheKey);
    if (cached.data) return cached.data;

    // Try Claude API first, fallback to rule-based
    const claudeInsight = await generateClaudeInsight(pool, score);
    const insight = claudeInsight ?? generateRuleBasedInsight(pool, score);

    // Cache for 10 minutes
    cacheService.set(cacheKey, insight, 600);
    return insight;
  }
}

export const aiInsightsService = new AiInsightsService();

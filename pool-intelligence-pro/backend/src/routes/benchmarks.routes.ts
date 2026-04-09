/**
 * Benchmarks financeiros em tempo real
 * GET /api/benchmarks — retorna CDI, Poupança, S&P500, Gold com cache 1h
 */
import { Router } from 'express';
import axios from 'axios';
import { logService } from '../services/log.service.js';

const router = Router();

interface BenchmarkData {
  name: string;
  monthlyPct: number;
  annualPct: number;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  isCache: boolean;
}

interface BenchmarksResult {
  cdi: BenchmarkData;
  poupanca: BenchmarkData;
  sp500: BenchmarkData;
  gold: BenchmarkData;
  fetchedAt: string;
  allFetched: boolean;
}

// Cache em memória — TTL 1 hora
let cache: { data: BenchmarksResult; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

// Fallback quando API falha (valores razoáveis de mercado)
const FALLBACK = {
  cdiAnnual: 13.75,
  sp500Annual: 10.0,
  goldAnnual: 8.0,
};

function annualToMonthly(annual: number): number {
  return ((1 + annual / 100) ** (1 / 12) - 1) * 100;
}

async function fetchCDI(): Promise<{ annual: number; source: string }> {
  const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json';
  const res = await axios.get(url, { timeout: 8000 });
  const annual = parseFloat(res.data?.[0]?.valor ?? '');
  if (isNaN(annual)) throw new Error('CDI: valor inválido');
  return { annual, source: 'Banco Central do Brasil' };
}

async function fetchYahooAnnualReturn(symbol: string): Promise<number> {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1mo&range=13mo`;
  const res = await axios.get(url, {
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const closes: number[] = res.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  // filtrar nulls
  const valid = closes.filter((v) => v != null && !isNaN(v));
  if (valid.length < 2) throw new Error(`${symbol}: dados insuficientes`);
  const first = valid[0];
  const last = valid[valid.length - 1];
  return ((last / first) - 1) * 100;
}

async function fetchAllBenchmarks(): Promise<BenchmarksResult> {
  const now = new Date().toISOString();
  let cdiAnnual = FALLBACK.cdiAnnual;
  let cdiSource = 'fallback (BCB indisponível)';
  let cdiUrl = 'https://www.bcb.gov.br/controleinflacao/taxaselic';
  let cdiIsCache = true;

  let sp500Annual = FALLBACK.sp500Annual;
  let sp500Source = 'fallback (Yahoo Finance indisponível)';
  let sp500IsCache = true;

  let goldAnnual = FALLBACK.goldAnnual;
  let goldSource = 'fallback (Yahoo Finance indisponível)';
  let goldIsCache = true;

  let allFetched = true;

  // Fetch em paralelo — falha individual não derruba o endpoint
  const results = await Promise.allSettled([
    fetchCDI(),
    fetchYahooAnnualReturn('^GSPC'),
    fetchYahooAnnualReturn('GC=F'),
  ]);

  if (results[0].status === 'fulfilled') {
    cdiAnnual = results[0].value.annual;
    cdiSource = results[0].value.source;
    cdiUrl = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432';
    cdiIsCache = false;
  } else {
    allFetched = false;
    logService.warn('SYSTEM', 'Benchmark CDI: usando fallback', { reason: (results[0] as PromiseRejectedResult).reason?.message });
  }

  if (results[1].status === 'fulfilled') {
    sp500Annual = results[1].value;
    sp500Source = 'Yahoo Finance (^GSPC, retorno 12 meses)';
    sp500IsCache = false;
  } else {
    allFetched = false;
    logService.warn('SYSTEM', 'Benchmark S&P500: usando fallback', { reason: (results[1] as PromiseRejectedResult).reason?.message });
  }

  if (results[2].status === 'fulfilled') {
    goldAnnual = results[2].value;
    goldSource = 'Yahoo Finance (GC=F, retorno 12 meses)';
    goldIsCache = false;
  } else {
    allFetched = false;
    logService.warn('SYSTEM', 'Benchmark Gold: usando fallback', { reason: (results[2] as PromiseRejectedResult).reason?.message });
  }

  // Poupança derivada do CDI (regra vigente no Brasil)
  // Selic > 8.5%/ano: 70% do CDI ao ano (TR + 70% da Selic)
  // Selic ≤ 8.5%/ano: Selic/12 + 0.5% ao mês (TR + 0.5%)
  const poupancaMonthly = cdiAnnual > 8.5
    ? annualToMonthly(cdiAnnual * 0.70)   // composto correto: 70% da Selic anual → mensal
    : cdiAnnual / 12 + 0.5;              // Selic/12 + 0.5% ao mês (nominal)
  const poupancaAnnual = cdiAnnual > 8.5
    ? Math.round(cdiAnnual * 0.70 * 100) / 100                                    // 70% do CDI anual
    : Math.round(((1 + poupancaMonthly / 100) ** 12 - 1) * 100 * 100) / 100;    // composto anual

  return {
    cdi: {
      name: 'CDI / Selic',
      monthlyPct: Math.round(annualToMonthly(cdiAnnual) * 1000) / 1000,
      annualPct: Math.round(cdiAnnual * 100) / 100,
      source: cdiSource,
      sourceUrl: cdiUrl,
      fetchedAt: now,
      isCache: cdiIsCache,
    },
    poupanca: {
      name: 'Poupança BR',
      monthlyPct: Math.round(poupancaMonthly * 1000) / 1000,
      annualPct: Math.round(poupancaAnnual * 100) / 100,
      source: `Derivado do CDI (${cdiAnnual > 8.5 ? '70% do CDI' : 'CDI/12 + 0.5%'})`,
      sourceUrl: 'https://www.bcb.gov.br',
      fetchedAt: now,
      isCache: cdiIsCache,
    },
    sp500: {
      name: 'S&P 500',
      monthlyPct: Math.round(annualToMonthly(sp500Annual) * 1000) / 1000,
      annualPct: Math.round(sp500Annual * 100) / 100,
      source: sp500Source,
      sourceUrl: 'https://finance.yahoo.com/quote/%5EGSPC',
      fetchedAt: now,
      isCache: sp500IsCache,
    },
    gold: {
      name: 'Ouro (Gold)',
      monthlyPct: Math.round(annualToMonthly(goldAnnual) * 1000) / 1000,
      annualPct: Math.round(goldAnnual * 100) / 100,
      source: goldSource,
      sourceUrl: 'https://finance.yahoo.com/quote/GC%3DF',
      fetchedAt: now,
      isCache: goldIsCache,
    },
    fetchedAt: now,
    allFetched,
  };
}

// GET /api/benchmarks
router.get('/benchmarks', async (_req, res) => {
  try {
    const now = Date.now();

    // Retornar cache se ainda válido
    if (cache && cache.expiresAt > now) {
      return res.json({
        success: true,
        data: { ...cache.data, cached: true },
        timestamp: new Date(),
      });
    }

    const data = await fetchAllBenchmarks();

    // Atualizar cache
    cache = { data, expiresAt: now + CACHE_TTL_MS };

    return res.json({ success: true, data: { ...data, cached: false }, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /benchmarks falhou', { error });
    // Se cache expirado mas existe, retorná-lo com aviso
    if (cache) {
      return res.json({
        success: true,
        data: { ...cache.data, cached: true, stale: true },
        timestamp: new Date(),
      });
    }
    return res.status(500).json({ success: false, error: 'Erro ao buscar benchmarks' });
  }
});

export default router;

/**
 * MemoryStore — camada de dados em memória
 *
 * Propósito: evitar re-cálculo e re-busca a cada request.
 * Os jobs (radar, watchlist) populam o store; as rotas leem diretamente daqui.
 *
 * Estratégia stale-while-revalidate:
 *  - Se dado fresco → retorna imediatamente (sem DB, sem API)
 *  - Se dado stale  → retorna o stale E dispara refresh em background
 *  - Se ausente     → sinaliza miss (rota faz fetch normal)
 *
 * Limite de memória: max MAX_POOLS pools (~600 KB estimado).
 * Pools mais antigos (fora da watchlist) são eviccionados automaticamente.
 */

import { UnifiedPool, Recommendation, Score } from '../types/index.js';
import { logService } from './log.service.js';

const MAX_POOLS = 500;               // cap máximo de pools em memória
const POOL_TTL_MS  = 15 * 60 * 1000; // 15 min — mesma frequência do radar
const SCORE_TTL_MS = 15 * 60 * 1000;
const REC_TTL_MS   =  5 * 60 * 1000; // 5 min — mesma frequência das recomendações

interface Entry<T> {
  data: T;
  updatedAt: number; // Date.now()
  ttlMs: number;
}

function isFresh<T>(entry: Entry<T>): boolean {
  return Date.now() - entry.updatedAt < entry.ttlMs;
}

class MemoryStore {
  // Dados principais
  private pools  = new Map<string, Entry<UnifiedPool>>();
  private scores = new Map<string, Entry<Score>>();
  private recommendations: Entry<Recommendation[]> | null = null;

  // Watchlist — apenas IDs; os dados ficam em `pools`
  private watchlistIds = new Set<string>();

  // Estatísticas internas
  private stats = { reads: 0, hits: 0, misses: 0, writes: 0 };

  // ─── Pools ────────────────────────────────────────────────────────────────

  setPool(pool: UnifiedPool, ttlMs = POOL_TTL_MS): void {
    this.pools.set(pool.id, { data: pool, updatedAt: Date.now(), ttlMs });
    this.stats.writes++;
  }

  /** Substitui todo o conjunto de pools de um batch (ex: resultado do radar) */
  setPools(pools: UnifiedPool[], ttlMs = POOL_TTL_MS): void {
    for (const p of pools) this.setPool(p, ttlMs);
    this.enforceLimit();
  }

  /** Retorna pool (fresco ou stale) ou null se não existe */
  getPool(id: string): UnifiedPool | null {
    this.stats.reads++;
    const entry = this.pools.get(id);
    if (!entry) { this.stats.misses++; return null; }
    this.stats.hits++;
    return entry.data; // stale-while-revalidate: sempre retorna se existe
  }

  /** true se o dado ainda está dentro do TTL */
  isPoolFresh(id: string): boolean {
    const entry = this.pools.get(id);
    return entry ? isFresh(entry) : false;
  }

  getAllPools(): UnifiedPool[] {
    return Array.from(this.pools.values()).map(e => e.data);
  }

  poolCount(): number { return this.pools.size; }

  // ─── Scores ───────────────────────────────────────────────────────────────

  setScore(poolId: string, score: Score, ttlMs = SCORE_TTL_MS): void {
    this.scores.set(poolId, { data: score, updatedAt: Date.now(), ttlMs });
  }

  getScore(poolId: string): Score | null {
    return this.scores.get(poolId)?.data ?? null;
  }

  isScoreFresh(poolId: string): boolean {
    const e = this.scores.get(poolId);
    return e ? isFresh(e) : false;
  }

  // ─── Recomendações ────────────────────────────────────────────────────────

  setRecommendations(recs: Recommendation[], ttlMs = REC_TTL_MS): void {
    this.recommendations = { data: recs, updatedAt: Date.now(), ttlMs };
  }

  getRecommendations(): Recommendation[] | null {
    return this.recommendations?.data ?? null;
  }

  areRecommendationsFresh(): boolean {
    return this.recommendations ? isFresh(this.recommendations) : false;
  }

  // ─── Watchlist ────────────────────────────────────────────────────────────

  /** Inicializa a watchlist (chamado na inicialização dos jobs) */
  setWatchlistIds(ids: string[]): void {
    this.watchlistIds = new Set(ids);
  }

  addToWatchlist(poolId: string): void   { this.watchlistIds.add(poolId); }
  removeFromWatchlist(poolId: string): void { this.watchlistIds.delete(poolId); }
  isInWatchlist(poolId: string): boolean { return this.watchlistIds.has(poolId); }
  getWatchlistIds(): string[]            { return Array.from(this.watchlistIds); }

  /** Retorna pools da watchlist que estão em memória */
  getWatchlistPools(): UnifiedPool[] {
    return this.getWatchlistIds()
      .map(id => this.getPool(id))
      .filter((p): p is UnifiedPool => p !== null);
  }

  // ─── Manutenção de memória ────────────────────────────────────────────────

  /**
   * Remove pools com dados mais que 2× o TTL e que não estão na watchlist.
   * Chamado pelo cron a cada hora.
   */
  evictStale(): number {
    let evicted = 0;
    const now = Date.now();

    for (const [id, entry] of this.pools.entries()) {
      if (!this.watchlistIds.has(id) && now - entry.updatedAt > entry.ttlMs * 2) {
        this.pools.delete(id);
        this.scores.delete(id);
        evicted++;
      }
    }

    if (evicted > 0) {
      logService.info('SYSTEM', `Evicted ${evicted} stale pools (remaining: ${this.pools.size})`);
    }
    return evicted;
  }

  /**
   * Garante que nunca excedemos MAX_POOLS.
   * Remove os mais antigos (que não estão na watchlist) até atingir o limite.
   */
  enforceLimit(max = MAX_POOLS): void {
    if (this.pools.size <= max) return;

    const candidates = Array.from(this.pools.entries())
      .filter(([id]) => !this.watchlistIds.has(id))
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt); // mais antigos primeiro

    const toRemove = candidates.slice(0, this.pools.size - max);
    for (const [id] of toRemove) {
      this.pools.delete(id);
      this.scores.delete(id);
    }

    if (toRemove.length > 0) {
      logService.info('SYSTEM', `Limit enforced: removed ${toRemove.length} pools`);
    }
  }

  // ─── Estatísticas ─────────────────────────────────────────────────────────

  getStats() {
    const totalReads = this.stats.reads || 1;
    return {
      pools:           this.pools.size,
      scores:          this.scores.size,
      watchlist:       this.watchlistIds.size,
      hasRecs:         this.recommendations !== null,
      recsFresh:       this.areRecommendationsFresh(),
      reads:           this.stats.reads,
      hits:            this.stats.hits,
      misses:          this.stats.misses,
      writes:          this.stats.writes,
      hitRatePct:      Math.round(this.stats.hits / totalReads * 100),
      estimatedKB:     Math.round(this.pools.size * 1.2 + this.scores.size * 0.5),
    };
  }
}

export const memoryStore = new MemoryStore();

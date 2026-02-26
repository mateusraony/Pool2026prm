import { RangePosition, Pool } from '../types/index.js';
import { logService } from './log.service.js';
import { telegramBot } from '../bot/telegram.js';
import { getLatestRadarResults } from '../jobs/index.js';
import { notificationSettingsService } from './notification-settings.service.js';

// ============================================================
// AI Suggestion Engine (rule-based with scoring)
// ============================================================
interface PositionAnalysis {
  shouldStay: boolean;
  confidence: number; // 0-100
  action: 'STAY' | 'EXIT' | 'REBALANCE' | 'MONITOR';
  reason: string;
  tip: string;
}

function analyzePosition(
  position: RangePosition,
  currentPrice: number,
  poolScore?: number,
  poolApr?: number,
): PositionAnalysis {
  const distToLower = ((currentPrice - position.rangeLower) / currentPrice) * 100;
  const distToUpper = ((position.rangeUpper - currentPrice) / currentPrice) * 100;
  const rangeWidth = ((position.rangeUpper - position.rangeLower) / position.entryPrice) * 100;
  const isOutOfRange = currentPrice < position.rangeLower || currentPrice > position.rangeUpper;
  const priceDrift = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  const score = poolScore ?? 50;
  const apr = poolApr ?? 30;

  // Out of range – strong suggestion to act
  if (isOutOfRange) {
    const direction = currentPrice < position.rangeLower ? 'baixo' : 'cima';
    return {
      shouldStay: false,
      confidence: 85,
      action: 'REBALANCE',
      reason: `Preço saiu do range para ${direction}. Posição parou de gerar fees.`,
      tip: apr > 30
        ? `APR de ${apr.toFixed(0)}% ainda é atrativo. Rebalanceie o range ao redor do preço atual.`
        : `APR de ${apr.toFixed(0)}% é baixo. Avalie se vale a pena remanejar.`,
    };
  }

  // Approaching lower edge
  if (distToLower < 5) {
    const bullishContext = score > 60 && priceDrift > -10;
    return {
      shouldStay: bullishContext,
      confidence: 70,
      action: bullishContext ? 'MONITOR' : 'EXIT',
      reason: `Preço está ${distToLower.toFixed(1)}% do limite inferior.`,
      tip: bullishContext
        ? `Score ${score.toFixed(0)}/100 positivo – tendência sugere recuperação. Monitore de perto.`
        : `Prepare saída ou ajuste do range para evitar perda de fees.`,
    };
  }

  // Approaching upper edge
  if (distToUpper < 5) {
    return {
      shouldStay: true,
      confidence: 75,
      action: 'MONITOR',
      reason: `Preço está ${distToUpper.toFixed(1)}% do limite superior.`,
      tip: `Tendência de alta. Pode ser interessante ampliar o range superior para capturar mais fees.`,
    };
  }

  // Price drifted significantly from entry
  if (Math.abs(priceDrift) > rangeWidth * 0.6) {
    return {
      shouldStay: true,
      confidence: 60,
      action: 'MONITOR',
      reason: `Preço derivou ${priceDrift.toFixed(1)}% desde a entrada.`,
      tip: `IL acumulado pode ser relevante. Compare com fees ganhos para decidir se mantém.`,
    };
  }

  // Good position – centered in range
  const weeklyApr = apr / 52;
  return {
    shouldStay: true,
    confidence: score,
    action: 'STAY',
    reason: `Posição bem centrada. Distância ao inferior: ${distToLower.toFixed(1)}%, superior: ${distToUpper.toFixed(1)}%.`,
    tip: `Gerando ~${weeklyApr.toFixed(2)}% por semana (${apr.toFixed(0)}% APR). Mantenha.`,
  };
}

// ============================================================
// Range Monitor Service
// ============================================================

class RangeMonitorService {
  private positions: Map<string, RangePosition> = new Map();
  private lastAlertTimes: Map<string, Date> = new Map();
  private alertCooldown = 30 * 60 * 1000; // 30 minutes between alerts

  createPosition(position: Omit<RangePosition, 'id' | 'createdAt' | 'isActive'>): RangePosition {
    const id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    const fullPosition: RangePosition = {
      ...position,
      id,
      createdAt: new Date(),
      isActive: true,
    };

    this.positions.set(id, fullPosition);
    logService.info('ALERT', 'Range position created', {
      id,
      pool: position.token0Symbol + '/' + position.token1Symbol,
      range: position.rangeLower + ' - ' + position.rangeUpper,
    });

    return fullPosition;
  }

  getPositions(): RangePosition[] {
    return Array.from(this.positions.values()).filter(p => p.isActive);
  }

  getAllPositions(): RangePosition[] {
    return Array.from(this.positions.values());
  }

  getPosition(id: string): RangePosition | undefined {
    return this.positions.get(id);
  }

  deletePosition(id: string): boolean {
    const position = this.positions.get(id);
    if (position) {
      position.isActive = false;
      logService.info('ALERT', 'Range position deactivated', { id });
      return true;
    }
    return false;
  }

  async checkAllPositions(): Promise<void> {
    const activePositions = this.getPositions();
    if (activePositions.length === 0) return;

    const radarResults = getLatestRadarResults();

    for (const position of activePositions) {
      try {
        const poolData = radarResults.find(
          r => r.pool.externalId === position.poolId ||
               (r.pool.chain === position.chain && r.pool.poolAddress === position.poolAddress)
        );

        if (!poolData) {
          logService.warn('ALERT', 'Pool not found for range check', { poolId: position.poolId });
          continue;
        }

        const currentPrice = poolData.pool.price || position.entryPrice;
        await this.checkPosition(position, currentPrice, poolData.pool, poolData.score?.total, poolData.score?.breakdown?.return?.aprEstimate);
      } catch (error) {
        logService.error('ALERT', 'Error checking range position', { id: position.id, error });
      }
    }
  }

  private async checkPosition(
    position: RangePosition,
    currentPrice: number,
    pool: Pool,
    poolScore?: number,
    poolApr?: number,
  ): Promise<void> {
    const { rangeLower, rangeUpper, alertThreshold, token0Symbol, token1Symbol } = position;

    const distanceToLower = ((currentPrice - rangeLower) / currentPrice) * 100;
    const distanceToUpper = ((rangeUpper - currentPrice) / currentPrice) * 100;
    const nearLowerEdge = distanceToLower <= alertThreshold && distanceToLower > 0;
    const nearUpperEdge = distanceToUpper <= alertThreshold && distanceToUpper > 0;
    const outsideRange = currentPrice < rangeLower || currentPrice > rangeUpper;

    position.lastCheckedAt = new Date();

    // Cooldown check
    const lastAlert = this.lastAlertTimes.get(position.id);
    if (lastAlert && Date.now() - lastAlert.getTime() < this.alertCooldown) {
      return;
    }

    const settings = notificationSettingsService.getSettings();
    const simLink = notificationSettingsService.getSimulationLink(position.chain, position.poolAddress);
    const posLink = notificationSettingsService.getPositionsLink();

    const analysis = analyzePosition(position, currentPrice, poolScore, poolApr);

    let message: string | null = null;

    if (outsideRange && settings.notifications.rangeExit) {
      const direction = currentPrice < rangeLower ? '⬇️ ABAIXO' : '⬆️ ACIMA';
      const actionEmoji = analysis.action === 'REBALANCE' ? '🔄' : '⚠️';

      message =
        `🚨 <b>SAIU DO RANGE — ${token0Symbol}/${token1Symbol}</b>\n\n` +
        `💰 <b>Preço atual:</b> <code>$${currentPrice.toFixed(4)}</code>\n` +
        `📊 <b>Seu range:</b> <code>$${rangeLower.toFixed(4)} – $${rangeUpper.toFixed(4)}</code>\n` +
        `📌 <b>Direção:</b> ${direction} do range\n\n` +
        `🤖 <b>Análise IA (${analysis.confidence}% confiança):</b>\n` +
        `${actionEmoji} ${analysis.reason}\n` +
        `💡 <i>${analysis.tip}</i>\n\n` +
        `🔗 <a href="${simLink}">Ver Simulação</a>  |  <a href="${posLink}">Minhas Posições</a>`;

    } else if ((nearLowerEdge || nearUpperEdge) && settings.notifications.nearRangeExit) {
      const edge = nearLowerEdge ? 'INFERIOR' : 'SUPERIOR';
      const dist = nearLowerEdge ? distanceToLower : distanceToUpper;
      const edgeEmoji = nearLowerEdge ? '📉' : '📈';

      message =
        `⚠️ <b>PRÓXIMO DO LIMITE ${edge} — ${token0Symbol}/${token1Symbol}</b>\n\n` +
        `${edgeEmoji} <b>Preço:</b> <code>$${currentPrice.toFixed(4)}</code>\n` +
        `📊 <b>Distância ao limite:</b> ${dist.toFixed(2)}%\n` +
        `📐 <b>Range:</b> <code>$${rangeLower.toFixed(4)} – $${rangeUpper.toFixed(4)}</code>\n\n` +
        `🤖 <b>Análise IA (${analysis.confidence}% confiança):</b>\n` +
        `${this.actionEmoji(analysis.action)} Ação sugerida: <b>${this.actionLabel(analysis.action)}</b>\n` +
        `📝 ${analysis.reason}\n` +
        `💡 <i>${analysis.tip}</i>\n\n` +
        `🔗 <a href="${simLink}">Analisar Agora</a>  |  <a href="${posLink}">Posições</a>`;
    }

    if (message) {
      this.lastAlertTimes.set(position.id, new Date());
      logService.warn('ALERT', 'Range alert triggered', {
        type: outsideRange ? 'OUT_OF_RANGE' : 'NEAR_RANGE_EXIT',
        pool: token0Symbol + '/' + token1Symbol,
        currentPrice,
      });
      await telegramBot.sendMessage(message);
    }
  }

  // Generate full portfolio report for daily summary
  async sendPortfolioReport(): Promise<void> {
    const positions = this.getPositions();
    if (positions.length === 0) return;

    const radarResults = getLatestRadarResults();
    const settings = notificationSettingsService.getSettings();
    const posLink = notificationSettingsService.getPositionsLink();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let totalCapital = 0;
    let report = `📊 <b>RELATÓRIO DIÁRIO DE POSIÇÕES</b>\n`;
    report += `📅 ${dateStr} às ${timeStr}\n\n`;

    for (const position of positions) {
      const poolData = radarResults.find(
        r => r.pool.externalId === position.poolId ||
             (r.pool.chain === position.chain && r.pool.poolAddress === position.poolAddress)
      );

      const currentPrice = poolData?.pool.price ?? position.entryPrice;
      const apr = poolData?.score?.breakdown?.return?.aprEstimate ?? 0;
      const poolScore = poolData?.score?.total ?? 50;
      const analysis = analyzePosition(position, currentPrice, poolScore, apr);

      const distToLower = ((currentPrice - position.rangeLower) / currentPrice) * 100;
      const distToUpper = ((position.rangeUpper - currentPrice) / currentPrice) * 100;
      const isOutOfRange = currentPrice < position.rangeLower || currentPrice > position.rangeUpper;

      const statusEmoji = isOutOfRange ? '🔴' : (distToLower < 8 || distToUpper < 8) ? '🟡' : '🟢';
      const simLink = notificationSettingsService.getSimulationLink(position.chain, position.poolAddress);

      totalCapital += position.capital;

      report += `${statusEmoji} <b>${position.token0Symbol}/${position.token1Symbol}</b> (${position.mode})\n`;
      report += `   💲 Preço: <code>$${currentPrice.toFixed(4)}</code>`;
      if (isOutOfRange) {
        report += ` ❌ <i>FORA DO RANGE</i>`;
      } else {
        report += ` | ↓${distToLower.toFixed(1)}%  ↑${distToUpper.toFixed(1)}%`;
      }
      report += `\n`;
      report += `   💼 Capital: $${position.capital.toLocaleString()} | APR: ${apr.toFixed(0)}%\n`;
      report += `   🤖 IA: ${this.actionEmoji(analysis.action)} <b>${this.actionLabel(analysis.action)}</b> — ${analysis.reason.substring(0, 80)}\n`;
      report += `   🔗 <a href="${simLink}">Detalhes</a>\n\n`;
    }

    report += `──────────────────\n`;
    report += `💼 <b>Capital Total Monitorado:</b> $${totalCapital.toLocaleString()}\n`;
    report += `📍 <b>Posições Ativas:</b> ${positions.length}\n\n`;
    report += `<a href="${posLink}">Ver todas as posições →</a>\n`;
    report += `<i>Pool Intelligence Pro</i>`;

    await telegramBot.sendMessage(report);
    logService.info('ALERT', 'Portfolio report sent via Telegram', { positions: positions.length });
  }

  private actionEmoji(action: PositionAnalysis['action']): string {
    const map: Record<string, string> = {
      STAY: '✅',
      EXIT: '🚪',
      REBALANCE: '🔄',
      MONITOR: '👁',
    };
    return map[action] ?? '🔔';
  }

  private actionLabel(action: PositionAnalysis['action']): string {
    const map: Record<string, string> = {
      STAY: 'Manter',
      EXIT: 'Sair',
      REBALANCE: 'Rebalancear',
      MONITOR: 'Monitorar',
    };
    return map[action] ?? action;
  }

  getStats(): { activePositions: number; totalPositions: number; alertsLast24h: number } {
    const now = Date.now();
    const alertsLast24h = Array.from(this.lastAlertTimes.values())
      .filter(t => now - t.getTime() < 24 * 60 * 60 * 1000).length;

    return {
      activePositions: this.getPositions().length,
      totalPositions: this.positions.size,
      alertsLast24h,
    };
  }
}

export const rangeMonitorService = new RangeMonitorService();

import { RangePosition, Pool, AlertEvent } from '../types/index.js';
import { logService } from './log.service.js';
import { telegramBot } from '../bot/telegram.js';
import { getLatestRadarResults } from '../jobs/index.js';

class RangeMonitorService {
  private positions: Map<string, RangePosition> = new Map();
  private lastAlertTimes: Map<string, Date> = new Map();
  private alertCooldown = 30 * 60 * 1000; // 30 minutes between alerts for same position

  // Create a new range position to monitor
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

  // Get all active positions
  getPositions(): RangePosition[] {
    return Array.from(this.positions.values()).filter(p => p.isActive);
  }

  // Get position by ID
  getPosition(id: string): RangePosition | undefined {
    return this.positions.get(id);
  }

  // Delete a position
  deletePosition(id: string): boolean {
    const position = this.positions.get(id);
    if (position) {
      position.isActive = false;
      logService.info('ALERT', 'Range position deactivated', { id });
      return true;
    }
    return false;
  }

  // Check all positions against current prices
  async checkAllPositions(): Promise<void> {
    const activePositions = this.getPositions();
    if (activePositions.length === 0) return;

    const radarResults = getLatestRadarResults();

    for (const position of activePositions) {
      try {
        // Find the pool in radar results
        const poolData = radarResults.find(
          r => r.pool.externalId === position.poolId ||
               (r.pool.chain === position.chain && r.pool.poolAddress === position.poolAddress)
        );

        if (!poolData) {
          logService.warn('ALERT', 'Pool not found for range check', { poolId: position.poolId });
          continue;
        }

        const currentPrice = poolData.pool.price || position.entryPrice;
        await this.checkPosition(position, currentPrice, poolData.pool);
      } catch (error) {
        logService.error('ALERT', 'Error checking range position', { id: position.id, error });
      }
    }
  }

  // Check single position
  private async checkPosition(position: RangePosition, currentPrice: number, pool: Pool): Promise<void> {
    const { rangeLower, rangeUpper, alertThreshold, token0Symbol, token1Symbol } = position;

    // Calculate distance to edges (as percentage)
    const distanceToLower = ((currentPrice - rangeLower) / currentPrice) * 100;
    const distanceToUpper = ((rangeUpper - currentPrice) / currentPrice) * 100;

    // Check if near either edge
    const nearLowerEdge = distanceToLower <= alertThreshold && distanceToLower > 0;
    const nearUpperEdge = distanceToUpper <= alertThreshold && distanceToUpper > 0;
    const outsideRange = currentPrice < rangeLower || currentPrice > rangeUpper;

    // Update last checked time
    position.lastCheckedAt = new Date();

    // Check cooldown
    const lastAlert = this.lastAlertTimes.get(position.id);
    if (lastAlert && Date.now() - lastAlert.getTime() < this.alertCooldown) {
      return; // Still in cooldown
    }

    let alertEvent: AlertEvent | null = null;

    if (outsideRange) {
      const direction = currentPrice < rangeLower ? 'ABAIXO' : 'ACIMA';
      alertEvent = {
        type: 'OUT_OF_RANGE',
        pool,
        message: `🚨 SAIU DO RANGE! ${token0Symbol}/${token1Symbol} está ${direction} do seu range!\n` +
                 `Preço atual: $${currentPrice.toFixed(2)}\n` +
                 `Seu range: $${rangeLower.toFixed(2)} - $${rangeUpper.toFixed(2)}`,
        data: {
          currentPrice,
          rangeLower,
          rangeUpper,
          direction,
          positionId: position.id,
        },
        timestamp: new Date(),
      };
    } else if (nearLowerEdge) {
      alertEvent = {
        type: 'NEAR_RANGE_EXIT',
        pool,
        message: `⚠️ ATENÇÃO: ${token0Symbol}/${token1Symbol} está próximo da borda INFERIOR do range!\n` +
                 `Preço atual: $${currentPrice.toFixed(2)} (${distanceToLower.toFixed(1)}% do limite)\n` +
                 `Range mínimo: $${rangeLower.toFixed(2)}`,
        data: {
          currentPrice,
          rangeLower,
          rangeUpper,
          distanceToEdge: distanceToLower,
          edge: 'lower',
          positionId: position.id,
        },
        timestamp: new Date(),
      };
    } else if (nearUpperEdge) {
      alertEvent = {
        type: 'NEAR_RANGE_EXIT',
        pool,
        message: `⚠️ ATENÇÃO: ${token0Symbol}/${token1Symbol} está próximo da borda SUPERIOR do range!\n` +
                 `Preço atual: $${currentPrice.toFixed(2)} (${distanceToUpper.toFixed(1)}% do limite)\n` +
                 `Range máximo: $${rangeUpper.toFixed(2)}`,
        data: {
          currentPrice,
          rangeLower,
          rangeUpper,
          distanceToEdge: distanceToUpper,
          edge: 'upper',
          positionId: position.id,
        },
        timestamp: new Date(),
      };
    }

    // Send alert if triggered
    if (alertEvent) {
      this.lastAlertTimes.set(position.id, new Date());
      logService.warn('ALERT', 'Range alert triggered', {
        type: alertEvent.type,
        pool: token0Symbol + '/' + token1Symbol,
        currentPrice,
        range: rangeLower + ' - ' + rangeUpper,
      });

      // Send via Telegram
      await telegramBot.sendAlert(alertEvent);
    }
  }

  // Get stats
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

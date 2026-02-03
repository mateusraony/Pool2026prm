import { checkAllAlerts } from '../../services/alerts/monitor.js';
import { log } from '../../utils/logger.js';

// Job: Verifica condições de alerta
export async function runCheckAlertsJob(): Promise<void> {
  const operation = log.startOperation('Check alerts job');

  try {
    await checkAllAlerts();
    operation.success();
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}

import cron from 'node-cron';
import { config } from '../config/index.js';
import { log } from '../utils/logger.js';

// Jobs
import { runScanPoolsJob } from './jobs/scanPools.js';
import { runUpdatePricesJob } from './jobs/updatePrices.js';
import { runSyncPositionsJob } from './jobs/syncPositions.js';
import { runCheckAlertsJob } from './jobs/checkAlerts.js';
import { runBackupJob } from './jobs/backup.js';

// ========================================
// SCHEDULER PRINCIPAL
// ========================================

interface ScheduledJob {
  name: string;
  schedule: string;
  task: cron.ScheduledTask | null;
  lastRun: Date | null;
  isRunning: boolean;
}

const jobs: Map<string, ScheduledJob> = new Map();

// Registra um job
function registerJob(
  name: string,
  intervalMinutes: number,
  handler: () => Promise<void>
): void {
  // Converte minutos para expressão cron
  // */30 * * * * = a cada 30 minutos
  const schedule = `*/${intervalMinutes} * * * *`;

  const job: ScheduledJob = {
    name,
    schedule,
    task: null,
    lastRun: null,
    isRunning: false,
  };

  // Wrapper com controle de concorrência
  const wrappedHandler = async () => {
    if (job.isRunning) {
      log.warn(`Job ${name} is already running, skipping`);
      return;
    }

    job.isRunning = true;
    log.job(name, 'start');

    try {
      await handler();
      job.lastRun = new Date();
      log.job(name, 'success');
    } catch (error) {
      log.job(name, 'error', { error });
    } finally {
      job.isRunning = false;
    }
  };

  job.task = cron.schedule(schedule, wrappedHandler, {
    scheduled: false, // Não inicia automaticamente
  });

  jobs.set(name, job);
  log.info(`Job registered: ${name} (every ${intervalMinutes} minutes)`);
}

// Inicia todos os jobs
export function startScheduler(): void {
  log.info('Starting scheduler...');

  // Registra jobs com intervalos da config
  registerJob('scanPools', config.scheduler.scanIntervalMinutes, runScanPoolsJob);
  registerJob('updatePrices', config.scheduler.priceUpdateMinutes, runUpdatePricesJob);
  registerJob('syncPositions', config.scheduler.positionSyncMinutes, runSyncPositionsJob);
  registerJob('checkAlerts', config.scheduler.alertCheckMinutes, runCheckAlertsJob);

  // Backup diário às 3:00 AM
  const backupJob: ScheduledJob = {
    name: 'backup',
    schedule: '0 3 * * *',
    task: cron.schedule('0 3 * * *', async () => {
      log.job('backup', 'start');
      try {
        await runBackupJob();
        log.job('backup', 'success');
      } catch (error) {
        log.job('backup', 'error', { error });
      }
    }, { scheduled: false }),
    lastRun: null,
    isRunning: false,
  };
  jobs.set('backup', backupJob);

  // Inicia todos os jobs
  for (const [name, job] of jobs) {
    if (job.task) {
      job.task.start();
      log.info(`Job started: ${name}`);
    }
  }

  // Roda scan inicial após 10 segundos
  setTimeout(() => {
    log.info('Running initial scan...');
    runScanPoolsJob().catch(error => {
      log.error('Initial scan failed', { error });
    });
  }, 10000);

  log.info('Scheduler started');
}

// Para todos os jobs
export function stopScheduler(): void {
  log.info('Stopping scheduler...');

  for (const [name, job] of jobs) {
    if (job.task) {
      job.task.stop();
      log.info(`Job stopped: ${name}`);
    }
  }

  jobs.clear();
  log.info('Scheduler stopped');
}

// Retorna status dos jobs
export function getSchedulerStatus(): {
  jobs: {
    name: string;
    schedule: string;
    lastRun: Date | null;
    isRunning: boolean;
  }[];
} {
  return {
    jobs: Array.from(jobs.values()).map(job => ({
      name: job.name,
      schedule: job.schedule,
      lastRun: job.lastRun,
      isRunning: job.isRunning,
    })),
  };
}

// Executa um job manualmente
export async function runJobManually(jobName: string): Promise<void> {
  const job = jobs.get(jobName);

  if (!job) {
    throw new Error(`Job not found: ${jobName}`);
  }

  if (job.isRunning) {
    throw new Error(`Job is already running: ${jobName}`);
  }

  log.info(`Running job manually: ${jobName}`);

  switch (jobName) {
    case 'scanPools':
      await runScanPoolsJob();
      break;
    case 'updatePrices':
      await runUpdatePricesJob();
      break;
    case 'syncPositions':
      await runSyncPositionsJob();
      break;
    case 'checkAlerts':
      await runCheckAlertsJob();
      break;
    case 'backup':
      await runBackupJob();
      break;
    default:
      throw new Error(`Unknown job: ${jobName}`);
  }

  job.lastRun = new Date();
}

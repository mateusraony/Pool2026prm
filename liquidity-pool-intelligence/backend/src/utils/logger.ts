import winston from 'winston';
import { config } from '../config/index.js';

// Formato customizado para logs
const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }

  return log;
});

// Criar logger
export const logger = winston.createLogger({
  level: config.isDev ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  defaultMeta: { service: 'liquidity-pool-intelligence' },
  transports: [
    // Console sempre
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      ),
    }),
  ],
});

// Tipos de log estruturado
export interface LogContext {
  module?: string;
  action?: string;
  poolId?: string;
  network?: string;
  duration?: number;
  error?: Error | unknown;
  [key: string]: unknown;
}

// Funções helper para logs estruturados
export const log = {
  info: (message: string, context?: LogContext) => {
    logger.info(message, context);
  },

  warn: (message: string, context?: LogContext) => {
    logger.warn(message, context);
  },

  error: (message: string, context?: LogContext) => {
    const errorContext = context?.error instanceof Error
      ? { ...context, error: context.error.message, stack: context.error.stack }
      : context;
    logger.error(message, errorContext);
  },

  debug: (message: string, context?: LogContext) => {
    logger.debug(message, context);
  },

  // Log de início de operação (retorna função para log de fim)
  startOperation: (operation: string, context?: LogContext) => {
    const startTime = Date.now();
    logger.debug(`Starting: ${operation}`, context);

    return {
      success: (message?: string, extraContext?: LogContext) => {
        const duration = Date.now() - startTime;
        logger.info(message || `Completed: ${operation}`, {
          ...context,
          ...extraContext,
          duration,
        });
      },
      fail: (error: Error | unknown, message?: string) => {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(message || `Failed: ${operation}`, {
          ...context,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
          duration,
        });
      },
    };
  },

  // Log de requisição HTTP
  httpRequest: (method: string, path: string, statusCode: number, duration: number) => {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${method} ${path} ${statusCode}`, { duration, statusCode });
  },

  // Log de job do scheduler
  job: (jobName: string, status: 'start' | 'success' | 'error', context?: LogContext) => {
    const prefix = status === 'start' ? '🔄' : status === 'success' ? '✅' : '❌';
    const level = status === 'error' ? 'error' : 'info';
    logger[level](`${prefix} Job [${jobName}]: ${status}`, { job: jobName, ...context });
  },

  // Log de alerta enviado
  alert: (alertType: string, severity: string, poolId?: string) => {
    logger.info(`🔔 Alert sent: [${severity}] ${alertType}`, { alertType, severity, poolId });
  },
};

export default logger;

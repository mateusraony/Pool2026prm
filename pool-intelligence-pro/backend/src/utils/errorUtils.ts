/**
 * errorUtils.ts — Utilitário de extração e logging de erros
 *
 * Padroniza o tratamento de erros em toda a API:
 * - Extrai mensagem legível de erros Prisma (código P2xxx)
 * - Retorna objeto estruturado com código + mensagem para a resposta HTTP
 * - Garante que o log sempre inclua o erro original completo
 *
 * Uso:
 *   import { extractError, prismaErrorMessage } from '../utils/errorUtils.js';
 *
 *   catch (error) {
 *     const { code, message, detail } = extractError(error);
 *     logService.error('SYSTEM', `POST /minha-rota falhou [${code}]`, { error, detail });
 *     return res.status(500).json({ success: false, error: message, code });
 *   }
 */

// ─── Tipos Prisma (sem import do @prisma/client para evitar dependência circular) ──

interface PrismaKnownError {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

function isPrismaError(e: unknown): e is PrismaKnownError {
  return (
    typeof e === 'object' && e !== null &&
    'code' in e && typeof (e as PrismaKnownError).code === 'string' &&
    (e as PrismaKnownError).code.startsWith('P')
  );
}

// ─── Mapeamento de códigos Prisma → mensagens legíveis ────────────────────────

const PRISMA_CODE_MAP: Record<string, string> = {
  // Erros de query
  P2000: 'Valor muito longo para o campo',
  P2001: 'Registro não encontrado',
  P2002: 'Violação de unicidade — registro duplicado',
  P2003: 'Violação de chave estrangeira',
  P2004: 'Restrição de banco de dados violada',
  P2005: 'Valor inválido para o campo',
  P2006: 'Valor inválido para o tipo',
  P2007: 'Erro de validação de dados',
  P2008: 'Erro de parsing na query',
  P2009: 'Erro de validação na query',
  P2010: 'Erro de query raw',
  P2011: 'Valor null em campo obrigatório',
  P2012: 'Valor obrigatório ausente',
  P2013: 'Argumento obrigatório ausente',
  P2014: 'Violação de relação obrigatória',
  P2015: 'Registro relacionado não encontrado',
  P2016: 'Erro de interpretação da query',
  P2017: 'Registros da relação não conectados',
  P2018: 'Registros conectados não encontrados',
  P2019: 'Erro de input',
  P2020: 'Valor fora do intervalo permitido',
  P2021: 'Tabela não existe no banco de dados — execute prisma db push',
  P2022: 'Coluna não existe no banco de dados — execute prisma db push',
  P2023: 'Dados inconsistentes na coluna',
  P2024: 'Timeout ao adquirir conexão do pool',
  P2025: 'Registro não encontrado para operação',
  P2026: 'Funcionalidade não suportada pelo banco',
  P2027: 'Múltiplos erros no banco durante transação',
  P2028: 'Erro de API de transação',
  P2030: 'Índice fulltext não encontrado',
  P2031: 'Mongo precisa de replica set para transações',
  P2033: 'Número muito grande para campo int',
  P2034: 'Falha na transação por deadlock — tente novamente',
  // Erros de conexão
  P1000: 'Autenticação falhou no banco de dados',
  P1001: 'Banco de dados inacessível — verifique a conexão',
  P1002: 'Banco de dados atingiu timeout',
  P1003: 'Banco de dados não existe',
  P1008: 'Operação atingiu timeout',
  P1009: 'Banco de dados já existe',
  P1010: 'Acesso negado pelo banco de dados',
  P1011: 'Erro de abertura de conexão TLS',
  P1012: 'Variável de ambiente obrigatória não definida no schema',
  P1013: 'String de conexão inválida',
  P1014: 'Tipo de banco não suportado',
  P1015: 'Feature não suportada pela versão do banco',
  P1016: 'Número incorreto de parâmetros na query raw',
  P1017: 'Conexão com o servidor encerrada',
};

// ─── Função principal ─────────────────────────────────────────────────────────

export interface ExtractedError {
  /** Código legível: P2021, VALIDATION, UNKNOWN, etc. */
  code: string;
  /** Mensagem amigável para exibir ao usuário */
  message: string;
  /** Detalhe técnico para logging (nunca enviar ao cliente em produção) */
  detail: string;
  /** true se for erro Prisma */
  isPrisma: boolean;
}

/**
 * Extrai informações estruturadas de qualquer erro.
 * Seguro para usar em catch blocks de rotas Express.
 */
export function extractError(error: unknown): ExtractedError {
  if (isPrismaError(error)) {
    const friendlyMsg = PRISMA_CODE_MAP[error.code] ?? `Erro de banco de dados (${error.code})`;
    const meta = error.meta ? ` [meta: ${JSON.stringify(error.meta)}]` : '';
    return {
      code: error.code,
      message: friendlyMsg,
      detail: `${error.code}: ${error.message}${meta}`,
      isPrisma: true,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
      detail: `${error.name}: ${error.message}${error.stack ? '\n' + error.stack.split('\n').slice(0, 5).join('\n') : ''}`,
      isPrisma: false,
    };
  }

  return {
    code: 'UNKNOWN',
    message: 'Erro desconhecido',
    detail: String(error),
    isPrisma: false,
  };
}

/**
 * Monta o payload JSON de erro para resposta HTTP.
 * Em desenvolvimento inclui o código técnico.
 * Em produção retorna mensagem amigável apenas.
 */
export function errorResponse(
  error: unknown,
  userFacingMessage?: string,
): { error: string; code: string; timestamp: Date } {
  const extracted = extractError(error);
  const isDev = process.env.NODE_ENV !== 'production';

  return {
    error: userFacingMessage ?? (isDev ? extracted.message : 'Erro interno do servidor'),
    code: extracted.code,
    timestamp: new Date(),
  };
}

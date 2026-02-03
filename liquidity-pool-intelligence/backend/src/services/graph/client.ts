import { GraphQLClient } from 'graphql-request';
import { config } from '../../config/index.js';
import { log } from '../../utils/logger.js';

// Cache de clientes GraphQL por rede
const clients: Map<string, GraphQLClient> = new Map();

// Obtém ou cria cliente GraphQL para uma rede
export function getGraphClient(network: string): GraphQLClient {
  const existingClient = clients.get(network);
  if (existingClient) {
    return existingClient;
  }

  const url = config.apis.graph[network];
  if (!url) {
    throw new Error(`No Graph URL configured for network: ${network}`);
  }

  const client = new GraphQLClient(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    // Timeout de 30 segundos
    timeout: 30000,
  });

  clients.set(network, client);
  return client;
}

// Executa query com retry e logging
export async function executeQuery<T>(
  network: string,
  query: string,
  variables?: Record<string, unknown>,
  retries: number = 3
): Promise<T> {
  const client = getGraphClient(network);
  const operation = log.startOperation('GraphQL query', { network });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await client.request<T>(query, variables);
      operation.success(`Query successful (attempt ${attempt})`);
      return result;
    } catch (error) {
      const isLastAttempt = attempt === retries;

      if (isLastAttempt) {
        operation.fail(error, `Query failed after ${retries} attempts`);
        throw error;
      }

      log.warn(`GraphQL query failed, retrying...`, {
        network,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });

      // Backoff exponencial
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  // TypeScript safety
  throw new Error('Unreachable');
}

// Testa conexão com The Graph
export async function testGraphConnection(network: string): Promise<boolean> {
  try {
    const client = getGraphClient(network);
    await client.request(`
      query {
        _meta {
          block {
            number
          }
        }
      }
    `);
    return true;
  } catch (error) {
    log.warn(`Graph connection test failed for ${network}`, { error });
    return false;
  }
}

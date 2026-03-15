import { Router } from 'express';

const router = Router();

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Pool Intelligence Pro API',
    description: 'Enterprise-grade DeFi liquidity pool intelligence system. Monitors, scores, and recommends pools across Ethereum, Arbitrum, Base, and Polygon.',
    version: '2.0.0',
    contact: { name: 'Pool Intelligence Pro' },
  },
  servers: [
    { url: '/api', description: 'API Base' },
  ],
  tags: [
    { name: 'Pools', description: 'Pool discovery, search, and detail' },
    { name: 'Recommendations', description: 'AI-powered pool recommendations' },
    { name: 'Watchlist', description: 'User watchlist management' },
    { name: 'Ranges', description: 'Range position monitoring and P&L' },
    { name: 'Alerts', description: 'Alert configuration and history' },
    { name: 'Favorites', description: 'Favorite pools management' },
    { name: 'Notes', description: 'Pool notes and annotations' },
    { name: 'Analytics', description: 'Monte Carlo, Backtest, LVR, Auto-Compound' },
    { name: 'Portfolio', description: 'Portfolio-level analytics (Sharpe, allocation, correlation)' },
    { name: 'Settings', description: 'User and system configuration' },
    { name: 'System', description: 'Health check and status' },
  ],
  paths: {
    '/pools': {
      get: {
        tags: ['Pools'],
        summary: 'List pools with filters',
        parameters: [
          { name: 'chain', in: 'query', schema: { type: 'string' }, description: 'Filter by chain (ethereum, arbitrum, base, polygon)' },
          { name: 'protocol', in: 'query', schema: { type: 'string' }, description: 'Filter by protocol' },
          { name: 'token', in: 'query', schema: { type: 'string' }, description: 'Filter by token symbol' },
          { name: 'bluechip', in: 'query', schema: { type: 'boolean' }, description: 'Only bluechip pairs' },
          { name: 'poolType', in: 'query', schema: { type: 'string', enum: ['CL', 'V2', 'STABLE'] } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'tvl' } },
          { name: 'sortDirection', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'minTVL', in: 'query', schema: { type: 'number' } },
          { name: 'minHealth', in: 'query', schema: { type: 'number' } },
        ],
        responses: {
          200: { description: 'List of pools with scores', content: { 'application/json': { schema: { $ref: '#/components/schemas/PoolListResponse' } } } },
        },
      },
    },
    '/pools/{chain}/{address}': {
      get: {
        tags: ['Pools'],
        summary: 'Get single pool',
        parameters: [
          { name: 'chain', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Pool with score data' } },
      },
    },
    '/pools-detail/{chain}/{address}': {
      get: {
        tags: ['Pools'],
        summary: 'Pool detail with ranges, fees, IL',
        parameters: [
          { name: 'chain', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Pool detail with ranges and fee estimates' } },
      },
    },
    '/recommendations': {
      get: {
        tags: ['Recommendations'],
        summary: 'Get AI recommendations',
        responses: { 200: { description: 'Top pool recommendations ranked by score' } },
      },
    },
    '/watchlist': {
      get: {
        tags: ['Watchlist'],
        summary: 'Get watchlist items',
        responses: { 200: { description: 'User watchlist' } },
      },
      post: {
        tags: ['Watchlist'],
        summary: 'Add pool to watchlist',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { poolId: { type: 'string' }, chain: { type: 'string' }, address: { type: 'string' } } } } } },
        responses: { 201: { description: 'Added to watchlist' } },
      },
    },
    '/watchlist/{id}': {
      delete: {
        tags: ['Watchlist'],
        summary: 'Remove from watchlist',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Removed' } },
      },
    },
    '/ranges': {
      get: {
        tags: ['Ranges'],
        summary: 'Get range positions with P&L',
        responses: { 200: { description: 'Active range positions enriched with P&L data' } },
      },
      post: {
        tags: ['Ranges'],
        summary: 'Create range position',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['poolId', 'chain', 'poolAddress', 'token0Symbol', 'token1Symbol', 'entryPrice', 'rangeLower', 'rangeUpper', 'capital', 'mode'],
                properties: {
                  poolId: { type: 'string' }, chain: { type: 'string' }, poolAddress: { type: 'string' },
                  token0Symbol: { type: 'string' }, token1Symbol: { type: 'string' },
                  entryPrice: { type: 'number' }, rangeLower: { type: 'number' }, rangeUpper: { type: 'number' },
                  capital: { type: 'number' }, mode: { type: 'string', enum: ['DEFENSIVE', 'NORMAL', 'AGGRESSIVE'] },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Position created' } },
      },
    },
    '/alerts': {
      get: { tags: ['Alerts'], summary: 'Get alerts', responses: { 200: { description: 'Alert list and stats' } } },
      post: { tags: ['Alerts'], summary: 'Create alert', responses: { 201: { description: 'Alert created' } } },
    },
    '/favorites': {
      get: { tags: ['Favorites'], summary: 'Get favorites', responses: { 200: { description: 'Favorite pools' } } },
      post: { tags: ['Favorites'], summary: 'Add favorite', responses: { 201: { description: 'Added' } } },
    },
    '/notes': {
      get: { tags: ['Notes'], summary: 'Get notes for a pool', responses: { 200: { description: 'Pool notes' } } },
      post: { tags: ['Notes'], summary: 'Add note', responses: { 201: { description: 'Note added' } } },
    },
    '/range-calc': {
      post: {
        tags: ['Analytics'],
        summary: 'Range calculator',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  chain: { type: 'string' }, address: { type: 'string' },
                  capital: { type: 'number' }, mode: { type: 'string', enum: ['DEFENSIVE', 'NORMAL', 'AGGRESSIVE'] },
                  horizonDays: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Range recommendation with fees and IL estimates' } },
      },
    },
    '/monte-carlo': {
      post: {
        tags: ['Analytics'],
        summary: 'Monte Carlo simulation',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { chain: { type: 'string' }, address: { type: 'string' }, capital: { type: 'number' }, mode: { type: 'string' }, horizonDays: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Monte Carlo simulation results with distribution' } },
      },
    },
    '/backtest': {
      post: {
        tags: ['Analytics'],
        summary: 'Backtest strategy',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { chain: { type: 'string' }, address: { type: 'string' }, capital: { type: 'number' }, mode: { type: 'string' }, periodDays: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Backtest results with daily returns and drawdown' } },
      },
    },
    '/lvr/{chain}/{address}': {
      get: {
        tags: ['Analytics'],
        summary: 'LVR (Loss-Versus-Rebalancing) analysis',
        parameters: [
          { name: 'chain', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'capital', in: 'query', schema: { type: 'number' } },
          { name: 'mode', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'LVR analysis with fee-to-LVR ratio' } },
      },
    },
    '/portfolio-analytics': {
      get: {
        tags: ['Portfolio'],
        summary: 'Portfolio analytics (Sharpe, Sortino, allocation)',
        responses: {
          200: {
            description: 'Portfolio-level analytics',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PortfolioAnalytics' } } },
          },
        },
      },
    },
    '/auto-compound': {
      post: {
        tags: ['Portfolio'],
        summary: 'Auto-compound simulation',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { chain: { type: 'string' }, address: { type: 'string' }, capital: { type: 'number' }, periodDays: { type: 'integer' }, compoundFrequency: { type: 'string', enum: ['daily', 'weekly', 'biweekly', 'monthly'] }, gasPerCompound: { type: 'number' } } } } } },
        responses: { 200: { description: 'Compound vs simple growth comparison' } },
      },
    },
    '/token-correlation/{chain}/{address}': {
      get: {
        tags: ['Portfolio'],
        summary: 'Token pair correlation analysis',
        parameters: [
          { name: 'chain', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Correlation, IL impact, pair type classification' } },
      },
    },
    '/settings/notifications': {
      get: { tags: ['Settings'], summary: 'Get notification settings', responses: { 200: { description: 'Current notification config' } } },
      put: { tags: ['Settings'], summary: 'Update notification settings', responses: { 200: { description: 'Settings updated' } } },
    },
  },
  components: {
    schemas: {
      PoolListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          pools: { type: 'array', items: { $ref: '#/components/schemas/UnifiedPool' } },
          total: { type: 'integer' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      UnifiedPool: {
        type: 'object',
        properties: {
          id: { type: 'string' }, chain: { type: 'string' }, protocol: { type: 'string' },
          poolAddress: { type: 'string' }, poolType: { type: 'string', enum: ['CL', 'V2', 'STABLE'] },
          baseToken: { type: 'string' }, quoteToken: { type: 'string' },
          tvlUSD: { type: 'number' }, feeTier: { type: 'number' },
          volume24hUSD: { type: 'number' }, fees24hUSD: { type: 'number' },
          aprFee: { type: 'number', nullable: true }, aprTotal: { type: 'number', nullable: true },
          volatilityAnn: { type: 'number' }, healthScore: { type: 'number' },
          bluechip: { type: 'boolean' }, warnings: { type: 'array', items: { type: 'string' } },
        },
      },
      PortfolioAnalytics: {
        type: 'object',
        properties: {
          totalCapital: { type: 'number' }, totalPnl: { type: 'number' },
          totalPnlPercent: { type: 'number' }, weightedApr: { type: 'number' },
          sharpeRatio: { type: 'number' }, sortinoRatio: { type: 'number' },
          maxDrawdown: { type: 'number' }, riskAdjustedApr: { type: 'number' },
          diversificationScore: { type: 'integer', minimum: 0, maximum: 100 },
          riskBand: { type: 'string', enum: ['conservative', 'balanced', 'aggressive'] },
          allocationByChain: { type: 'array', items: { type: 'object', properties: { chain: { type: 'string' }, capital: { type: 'number' }, percent: { type: 'number' } } } },
          allocationByProtocol: { type: 'array', items: { type: 'object', properties: { protocol: { type: 'string' }, capital: { type: 'number' }, percent: { type: 'number' } } } },
          allocationByToken: { type: 'array', items: { type: 'object', properties: { token: { type: 'string' }, exposure: { type: 'number' }, percent: { type: 'number' } } } },
        },
      },
    },
  },
};

// GET /api/docs — OpenAPI JSON spec
router.get('/docs', (_req, res) => {
  res.json(openApiSpec);
});

// GET /api/docs/ui — Swagger UI (CDN-based, lightweight)
router.get('/docs/ui', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Pool Intelligence Pro — API Docs</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #0a0e1a; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { max-width: 1200px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
      defaultModelsExpandDepth: 1,
    });
  </script>
</body>
</html>`);
});

export default router;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultMode" TEXT NOT NULL DEFAULT 'NORMAL',
    "defaultCapital" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "weightHealth" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "weightReturn" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "weightRisk" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "minLiquidity" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "minVolume24h" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "minPoolAgeDays" INTEGER NOT NULL DEFAULT 7,
    "volatilityDefensive" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "volatilityNormal" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "volatilityAggressive" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "alertCooldownMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxAlertsPerHour" INTEGER NOT NULL DEFAULT 10,
    "cacheTtlMacro" INTEGER NOT NULL DEFAULT 3600,
    "cacheTtlPrice" INTEGER NOT NULL DEFAULT 60,
    "cacheTtlWatchlist" INTEGER NOT NULL DEFAULT 300,
    "circuitBreakerThreshold" INTEGER NOT NULL DEFAULT 5,
    "circuitBreakerTimeout" INTEGER NOT NULL DEFAULT 300,
    "activeChains" JSONB NOT NULL DEFAULT '["ethereum", "arbitrum", "base", "polygon"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "token0Symbol" TEXT NOT NULL,
    "token0Address" TEXT NOT NULL,
    "token1Symbol" TEXT NOT NULL,
    "token1Address" TEXT NOT NULL,
    "feeTier" DOUBLE PRECISION,
    "tvl" DOUBLE PRECISION,
    "volume24h" DOUBLE PRECISION,
    "apr" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "rejectReason" TEXT,
    "sourceProvider" TEXT NOT NULL,
    "sourceData" JSONB,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAnalyzedAt" TIMESTAMP(3),

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolCurrent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "token0Symbol" TEXT NOT NULL,
    "token0Address" TEXT NOT NULL,
    "token0Decimals" INTEGER NOT NULL DEFAULT 18,
    "token1Symbol" TEXT NOT NULL,
    "token1Address" TEXT NOT NULL,
    "token1Decimals" INTEGER NOT NULL DEFAULT 18,
    "feeTier" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "priceToken0Usd" DOUBLE PRECISION,
    "priceToken1Usd" DOUBLE PRECISION,
    "tvl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume7d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fees24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fees7d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volatility24h" DOUBLE PRECISION,
    "volatility7d" DOUBLE PRECISION,
    "priceChange24h" DOUBLE PRECISION,
    "priceChange7d" DOUBLE PRECISION,
    "rsi14" DOUBLE PRECISION,
    "macdLine" DOUBLE PRECISION,
    "macdSignal" DOUBLE PRECISION,
    "macdHistogram" DOUBLE PRECISION,
    "dataQuality" TEXT NOT NULL DEFAULT 'GOOD',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staleSince" TIMESTAMP(3),
    "primarySource" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "sourcesAgreed" BOOLEAN NOT NULL DEFAULT true,
    "divergencePercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolCurrent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolSnapshot" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "tvl" DOUBLE PRECISION NOT NULL,
    "volume24h" DOUBLE PRECISION NOT NULL,
    "fees24h" DOUBLE PRECISION,
    "volume1h" DOUBLE PRECISION,
    "volume5m" DOUBLE PRECISION,
    "fees1h" DOUBLE PRECISION,
    "fees5m" DOUBLE PRECISION,
    "aprFee" DOUBLE PRECISION,
    "aprAdjusted" DOUBLE PRECISION,
    "volatilityAnn" DOUBLE PRECISION,
    "healthScore" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "decimals" INTEGER NOT NULL DEFAULT 18,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isBluechip" BOOLEAN NOT NULL DEFAULT false,
    "flags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "token0Symbol" TEXT NOT NULL DEFAULT '',
    "token1Symbol" TEXT NOT NULL DEFAULT '',
    "protocol" TEXT NOT NULL DEFAULT '',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "healthScore" DOUBLE PRECISION NOT NULL,
    "returnScore" DOUBLE PRECISION NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "healthBreakdown" JSONB NOT NULL,
    "returnBreakdown" JSONB NOT NULL,
    "riskBreakdown" JSONB NOT NULL,
    "recommendedMode" TEXT NOT NULL,
    "isSuspect" BOOLEAN NOT NULL DEFAULT false,
    "suspectReason" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataTimestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRecommendation" (
    "id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "poolExternalId" TEXT NOT NULL,
    "poolName" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "commentary" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "estimatedGainPercent" DOUBLE PRECISION NOT NULL,
    "estimatedGainUsd" DOUBLE PRECISION NOT NULL,
    "capitalUsed" DOUBLE PRECISION NOT NULL,
    "entryConditions" JSONB NOT NULL,
    "exitConditions" JSONB NOT NULL,
    "mainRisks" JSONB NOT NULL,
    "mode" TEXT NOT NULL,
    "dataSnapshot" JSONB NOT NULL,
    "dataTimestamp" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "customAlerts" JSONB,
    "notes" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolId" TEXT,
    "type" TEXT NOT NULL,
    "triggerValue" DOUBLE PRECISION,
    "triggerCondition" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" TEXT NOT NULL,
    "alertId" TEXT,
    "userId" TEXT,
    "poolExternalId" TEXT,
    "poolName" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "sentToTelegram" BOOLEAN NOT NULL DEFAULT false,
    "telegramError" TEXT,
    "wasFiltered" BOOLEAN NOT NULL DEFAULT false,
    "filterReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolExternalId" TEXT NOT NULL,
    "poolName" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION,
    "entryTvl" DOUBLE PRECISION,
    "capitalInvested" DOUBLE PRECISION NOT NULL,
    "rangeLower" DOUBLE PRECISION,
    "rangeUpper" DOUBLE PRECISION,
    "isInRange" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "entryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RangePositionRecord" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "token0Symbol" TEXT NOT NULL,
    "token1Symbol" TEXT NOT NULL,
    "rangeLower" DOUBLE PRECISION NOT NULL,
    "rangeUpper" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "capital" DOUBLE PRECISION NOT NULL,
    "mode" TEXT NOT NULL,
    "alertThreshold" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RangePositionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderHealth" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isHealthy" BOOLEAN NOT NULL DEFAULT true,
    "isCircuitOpen" BOOLEAN NOT NULL DEFAULT false,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "totalFailures" INTEGER NOT NULL DEFAULT 0,
    "avgLatency" DOUBLE PRECISION,
    "lastLatency" DOUBLE PRECISION,
    "requestsThisMinute" INTEGER NOT NULL DEFAULT 0,
    "requestsThisHour" INTEGER NOT NULL DEFAULT 0,
    "rateLimitHits" INTEGER NOT NULL DEFAULT 0,
    "circuitOpenedAt" TIMESTAMP(3),
    "circuitClosesAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PositionHistory" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "token0" TEXT NOT NULL,
    "token1" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mode" TEXT,
    "capital" DOUBLE PRECISION,
    "pnl" DOUBLE PRECISION,
    "rangeLower" DOUBLE PRECISION,
    "rangeUpper" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_externalId_key" ON "Candidate"("externalId");

-- CreateIndex
CREATE INDEX "Candidate_chain_status_idx" ON "Candidate"("chain", "status");

-- CreateIndex
CREATE INDEX "Candidate_discoveredAt_idx" ON "Candidate"("discoveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PoolCurrent_externalId_key" ON "PoolCurrent"("externalId");

-- CreateIndex
CREATE INDEX "PoolCurrent_chain_protocol_idx" ON "PoolCurrent"("chain", "protocol");

-- CreateIndex
CREATE INDEX "PoolCurrent_lastUpdated_idx" ON "PoolCurrent"("lastUpdated");

-- CreateIndex
CREATE INDEX "PoolSnapshot_poolId_timestamp_idx" ON "PoolSnapshot"("poolId", "timestamp");

-- CreateIndex
CREATE INDEX "Token_symbol_idx" ON "Token"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Token_chain_address_key" ON "Token"("chain", "address");

-- CreateIndex
CREATE INDEX "Favorite_addedAt_idx" ON "Favorite"("addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_poolId_key" ON "Favorite"("poolId");

-- CreateIndex
CREATE INDEX "Note_poolId_idx" ON "Note"("poolId");

-- CreateIndex
CREATE INDEX "Note_createdAt_idx" ON "Note"("createdAt");

-- CreateIndex
CREATE INDEX "JobRun_name_startedAt_idx" ON "JobRun"("name", "startedAt");

-- CreateIndex
CREATE INDEX "Score_poolId_calculatedAt_idx" ON "Score"("poolId", "calculatedAt");

-- CreateIndex
CREATE INDEX "Score_totalScore_idx" ON "Score"("totalScore");

-- CreateIndex
CREATE INDEX "AIRecommendation_rank_isActive_idx" ON "AIRecommendation"("rank", "isActive");

-- CreateIndex
CREATE INDEX "AIRecommendation_createdAt_idx" ON "AIRecommendation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_poolId_key" ON "Watchlist"("userId", "poolId");

-- CreateIndex
CREATE INDEX "Alert_userId_isActive_idx" ON "Alert"("userId", "isActive");

-- CreateIndex
CREATE INDEX "AlertLog_userId_createdAt_idx" ON "AlertLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AlertLog_type_createdAt_idx" ON "AlertLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Position_userId_status_idx" ON "Position"("userId", "status");

-- CreateIndex
CREATE INDEX "RangePositionRecord_isActive_idx" ON "RangePositionRecord"("isActive");

-- CreateIndex
CREATE INDEX "RangePositionRecord_chain_poolAddress_idx" ON "RangePositionRecord"("chain", "poolAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderHealth_provider_key" ON "ProviderHealth"("provider");

-- CreateIndex
CREATE INDEX "ProviderHealth_isHealthy_idx" ON "ProviderHealth"("isHealthy");

-- CreateIndex
CREATE INDEX "SystemLog_level_createdAt_idx" ON "SystemLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_component_createdAt_idx" ON "SystemLog"("component", "createdAt");

-- CreateIndex
CREATE INDEX "PositionHistory_poolId_idx" ON "PositionHistory"("poolId");

-- CreateIndex
CREATE INDEX "PositionHistory_chain_idx" ON "PositionHistory"("chain");

-- CreateIndex
CREATE INDEX "PositionHistory_createdAt_idx" ON "PositionHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "PoolSnapshot" ADD CONSTRAINT "PoolSnapshot_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "PoolCurrent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "PoolCurrent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "PoolCurrent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "PoolCurrent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


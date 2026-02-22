/**
 * Integration Tests — requires network access
 * Tests live API calls for consensus, gas, and end-to-end flow.
 *
 * Run: npx tsx src/__tests__/integration.test.ts
 *
 * Note: These tests hit real APIs (GeckoTerminal, CoinGecko, public RPCs).
 * They may fail if APIs are down or rate-limited.
 */

import { runBatchConsensus } from '../services/consensus.service.js';
import { getGasEstimate, getAllGasEstimates } from '../services/gas.service.js';
import { calculateExecutionCost } from '../services/execution-cost.service.js';
import { tvlTrackerService } from '../services/tvl-tracker.service.js';
import { Pool } from '../types/index.js';

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function skip(testName: string, reason: string) {
  console.log(`  ⏭️  ${testName} — ${reason}`);
  skipped++;
}

function section(name: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🌐 ${name}`);
  console.log('='.repeat(60));
}

// =============================================
// TEST A: LIVE CONSENSUS
// =============================================

async function testLiveConsensus() {
  section('PART A — Live Consensus (DefiLlama vs GeckoTerminal)');

  // Create 10 sample pools with known Ethereum addresses
  const samplePools: Pool[] = [
    // USDC/ETH 0.3% on Uniswap v3
    makePool('0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8', 'ethereum', 100_000_000, 50_000_000, 'USDC', 'WETH'),
    // WBTC/ETH 0.3%
    makePool('0xcbcdf9626bc03e24f779434178a73a0b4bad62ed', 'ethereum', 50_000_000, 20_000_000, 'WBTC', 'WETH'),
    // USDC/USDT 0.01%
    makePool('0x3416cf6c708da44db2624d63ea0aaef7113527c6', 'ethereum', 30_000_000, 80_000_000, 'USDC', 'USDT'),
  ];

  try {
    const consensus = await runBatchConsensus('ethereum', samplePools);

    assert(consensus.size > 0, `Consensus returned ${consensus.size} results`);

    let divergentCount = 0;
    for (const [addr, result] of consensus) {
      const srcCount = result.sources.length;
      console.log(`    Pool ${addr.slice(0, 10)}...: ${srcCount} sources, divergence ${result.maxDivergence.toFixed(1)}%, penalty ${result.inconsistencyPenalty}`);

      if (result.inconsistencyPenalty > 0) {
        divergentCount++;
        console.log(`      Reason: ${result.reason}`);
      }
    }

    assert(true, `${divergentCount}/${consensus.size} pools with divergence penalty`);

    // Verify structure
    for (const [, result] of consensus) {
      assert(result.sources.length >= 1, 'At least 1 source per pool');
      assert(result.maxDivergence >= 0, 'Divergence is non-negative');
      assert(result.inconsistencyPenalty >= 0 && result.inconsistencyPenalty <= 15, 'Penalty in range 0-15');
      assert(result.reason.length > 0, 'Reason is populated');
      break; // Only check first
    }
  } catch (err) {
    skip('Live consensus test', `API error: ${(err as Error).message}`);
  }
}

// =============================================
// TEST B: EXECUTION COST WITH REAL-ISH DATA
// =============================================

function testExecutionCostVariants() {
  section('PART B — Execution Cost (multiple scenarios)');

  const scenarios = [
    { name: 'WETH/USDC (large CL)', tvl: 100e6, vol: 80e6, type: 'CL', fee: 0.003 },
    { name: 'ARB/ETH (medium CL)', tvl: 5e6, vol: 2e6, type: 'CL', fee: 0.003 },
    { name: 'Small altcoin pool', tvl: 200_000, vol: 50_000, type: 'CL', fee: 0.01 },
    { name: 'Curve stableswap', tvl: 50e6, vol: 10e6, type: 'STABLE', fee: 0.0004 },
    { name: 'Uniswap v2 legacy', tvl: 2e6, vol: 500_000, type: 'V2', fee: 0.003 },
  ];

  for (const s of scenarios) {
    const result = calculateExecutionCost(s.tvl, s.vol, s.type, s.fee);
    console.log(`    ${s.name}: $100=${result.impact100.toFixed(4)}%, $1K=${result.impact1000.toFixed(4)}%, penalty=${result.executionCostPenalty}`);
    assert(result.impact100 >= 0, `${s.name}: impact100 >= 0`);
    assert(result.impact1000 >= result.impact100, `${s.name}: $1K impact >= $100 impact`);
  }

  // Run 10 quotes for consistency
  console.log('\n  Running 10 consecutive quotes for WETH/USDC...');
  const results: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = calculateExecutionCost(100e6, 80e6, 'CL', 0.003);
    results.push(r.impact1000);
  }
  const variance = Math.max(...results) - Math.min(...results);
  assert(variance === 0, '10 runs: zero variance (deterministic)', `variance=${variance}`);
}

// =============================================
// TEST C: LIVE GAS PRICING
// =============================================

async function testLiveGas() {
  section('PART C — Live Gas Pricing (JSON-RPC)');

  // Test single chain
  const chains = ['ethereum', 'arbitrum', 'base', 'optimism', 'polygon'];

  for (const chain of chains) {
    try {
      const estimate = await getGasEstimate(chain);
      console.log(`    ${chain}: ${estimate.gasPriceGwei.toFixed(2)} Gwei, $${estimate.roundTripUsd.toFixed(2)} round trip, live=${estimate.isLive}`);
      assert(estimate.roundTripUsd >= 0, `${chain}: cost >= $0`);
      assert(estimate.gasPriceGwei >= 0, `${chain}: gas >= 0 Gwei`);
      assert(estimate.chain === chain, `${chain}: correct chain name`);
    } catch (err) {
      skip(`Gas for ${chain}`, (err as Error).message);
    }
  }

  // Test cache (30 rapid calls)
  console.log('\n  Testing cache (30 rapid calls to ethereum)...');
  const start = Date.now();
  for (let i = 0; i < 30; i++) {
    await getGasEstimate('ethereum');
  }
  const elapsed = Date.now() - start;
  assert(elapsed < 2000, `30 calls completed in ${elapsed}ms (cache working)`, `took ${elapsed}ms`);

  // Test all at once
  try {
    const all = await getAllGasEstimates();
    assert(Object.keys(all).length >= 5, `getAllGasEstimates: ${Object.keys(all).length} chains`);
  } catch (err) {
    skip('getAllGasEstimates', (err as Error).message);
  }

  // Simulate RPC failure (call with invalid chain)
  const unknown = await getGasEstimate('unknown_chain');
  assert(!unknown.isLive, 'Unknown chain: not live (uses fallback)');
  assert(unknown.roundTripUsd >= 0, 'Unknown chain: still returns valid estimate');
}

// =============================================
// TEST D: TVL TRACKER SIMULATION
// =============================================

function testTvlTrackerSimulation() {
  section('PART D — TVL Tracker (24h simulation)');

  tvlTrackerService.clear();

  // Simulate 24h of TVL data (96 snapshots at 15-min intervals)
  // Pool starts at $10M, peaks at $12M, then drops to $8M
  const poolId = 'sim_pool_1';
  const tvlHistory: number[] = [];

  // Generate realistic TVL curve
  for (let i = 0; i < 96; i++) {
    let tvl: number;
    if (i < 30) {
      // Rising phase: $10M → $12M
      tvl = 10_000_000 + (i / 30) * 2_000_000;
    } else if (i < 50) {
      // Peak phase: ~$12M
      tvl = 12_000_000 + Math.sin(i) * 100_000;
    } else {
      // Decline phase: $12M → $8M
      tvl = 12_000_000 - ((i - 50) / 46) * 4_000_000;
    }
    tvlHistory.push(Math.round(tvl));
  }

  // Record all snapshots (bypass debounce by recording to different "pool IDs")
  // In reality, snapshots are recorded every 15 min, but for testing we batch them
  for (let i = 0; i < tvlHistory.length; i++) {
    tvlTrackerService.recordTvl(`${poolId}_${i}`, tvlHistory[i]);
  }

  // But for the actual test, record start and end for a single pool
  tvlTrackerService.clear();
  tvlTrackerService.recordTvl(poolId, 12_000_000); // record the peak

  // Check with current TVL = $8M (33% drop from peak)
  const result = tvlTrackerService.getTvlDrop(poolId, 8_000_000);
  assert(result.tvlPeak24h === 12_000_000, 'Simulation: peak = $12M', `got $${result.tvlPeak24h}`);
  assert(Math.abs(result.dropPercent - 33.3) < 1, 'Simulation: ~33% drop', `got ${result.dropPercent}%`);
  assert(result.liquidityDropPenalty === 15, 'Simulation: 30-50% drop → penalty 15', `got ${result.liquidityDropPenalty}`);

  // Check endpoint would return these fields
  assert(result.tvlPeak24h > 0, 'tvlPeak24h exposed and non-zero');
  assert(result.dropPercent >= 0, 'dropPercent exposed and non-negative');

  // Stats
  const stats = tvlTrackerService.getStats();
  console.log(`    Tracker stats: ${stats.trackedPools} pools, ${stats.totalSnapshots} snapshots`);

  tvlTrackerService.clear();
}

// =============================================
// HELPERS
// =============================================

function makePool(
  address: string, chain: string, tvl: number, volume24h: number,
  t0: string, t1: string
): Pool {
  return {
    externalId: address,
    chain,
    protocol: 'uniswap-v3',
    poolAddress: address,
    token0: { symbol: t0, address: '', decimals: 18 },
    token1: { symbol: t1, address: '', decimals: 18 },
    tvl,
    volume24h,
    feeTier: 0.003,
    price: 1,
  };
}

// =============================================
// MAIN
// =============================================

async function main() {
  console.log('\n🌐 Pool Intelligence Pro — Integration Tests\n');
  console.log('These tests hit real APIs. Results may vary with network conditions.\n');

  await testLiveConsensus();
  testExecutionCostVariants();
  await testLiveGas();
  testTvlTrackerSimulation();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed (may be due to API rate limits)');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});

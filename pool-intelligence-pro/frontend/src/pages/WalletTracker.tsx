import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Plus, Trash2, RefreshCw, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MainLayout } from '@/components/layout/MainLayout';
import { apiClient } from '@/api/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface WalletPosition {
  id: string;
  chain: string;
  protocol: string;
  poolId: string;
  token0Symbol: string;
  token1Symbol: string;
  feeTier: number;
  liquidity: string;
  depositedToken0: string;
  depositedToken1: string;
  collectedFeesToken0: string;
  collectedFeesToken1: string;
  inRange: boolean;
  tvlUSD?: number;
}

interface ChainPositions {
  chain: string;
  positions: WalletPosition[];
}

interface TrackedWallet {
  address: string;
  label?: string;
  addedAt: string;
}

// ============================================================
// API helpers
// ============================================================

const fetchPositions = (address: string): Promise<ChainPositions[]> =>
  apiClient.get(`/wallet/${address}/positions`).then(r => r.data.data);

const fetchWallets = (): Promise<TrackedWallet[]> =>
  apiClient.get('/wallets').then(r => r.data.data);

const addWallet = (data: { address: string; label?: string }): Promise<{ success: boolean; data: TrackedWallet }> =>
  apiClient.post('/wallets', data).then(r => r.data);

const removeWallet = (address: string): Promise<{ success: boolean }> =>
  apiClient.delete(`/wallets/${address}`).then(r => r.data);

// ============================================================
// Helper utils
// ============================================================

const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatNumber(val: string | number | undefined, decimals = 4): string {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

const CHAIN_COLORS: Record<string, string> = {
  ethereum: '#627EEA',
  arbitrum: '#28A0F0',
  base: '#0052FF',
  polygon: '#8247E5',
};

// ============================================================
// Sub-components
// ============================================================

function PositionCard({ position }: { position: WalletPosition }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">
            {position.token0Symbol}/{position.token1Symbol}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {(position.feeTier * 100).toFixed(2)}%
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {position.protocol}
          </Badge>
        </div>
        {position.inRange ? (
          <div className="flex items-center gap-1 text-green-500 text-xs">
            <CheckCircle className="h-3 w-3" />
            <span>In Range</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-destructive text-xs">
            <XCircle className="h-3 w-3" />
            <span>Out of Range</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded bg-background/50 p-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">TVL</p>
          <p className="font-mono text-xs">
            {position.tvlUSD != null ? `$${formatNumber(position.tvlUSD, 0)}` : '—'}
          </p>
        </div>
        <div className="rounded bg-background/50 p-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deposited {position.token0Symbol}</p>
          <p className="font-mono text-xs">{formatNumber(position.depositedToken0)}</p>
        </div>
        <div className="rounded bg-background/50 p-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deposited {position.token1Symbol}</p>
          <p className="font-mono text-xs">{formatNumber(position.depositedToken1)}</p>
        </div>
        <div className="rounded bg-background/50 p-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fees Collected</p>
          <p className="font-mono text-xs">
            {formatNumber(position.collectedFeesToken0, 4)} / {formatNumber(position.collectedFeesToken1, 6)}
          </p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground font-mono truncate">Pool: {position.poolId}</p>
    </div>
  );
}

// ============================================================
// Main page
// ============================================================

export default function WalletTracker() {
  const queryClient = useQueryClient();
  const [inputAddress, setInputAddress] = useState('');
  const [inputLabel, setInputLabel] = useState('');
  const [analyzingAddress, setAnalyzingAddress] = useState('');
  const [addressError, setAddressError] = useState('');

  // Tracked wallets list
  const { data: trackedWallets = [], isLoading: walletsLoading } = useQuery({
    queryKey: ['tracked-wallets'],
    queryFn: fetchWallets,
    staleTime: 30000,
  });

  // Positions for the currently selected wallet
  const {
    data: positions,
    isLoading: positionsLoading,
    isFetching: positionsFetching,
    refetch: refetchPositions,
    error: positionsError,
  } = useQuery({
    queryKey: ['wallet-positions', analyzingAddress],
    queryFn: () => fetchPositions(analyzingAddress),
    enabled: !!analyzingAddress,
    staleTime: 120000,
  });

  const addMutation = useMutation({
    mutationFn: addWallet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracked-wallets'] });
      toast.success('Wallet adicionada');
      setInputAddress('');
      setInputLabel('');
    },
    onError: () => toast.error('Erro ao adicionar wallet'),
  });

  const removeMutation = useMutation({
    mutationFn: removeWallet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracked-wallets'] });
      toast.success('Wallet removida');
    },
    onError: () => toast.error('Erro ao remover wallet'),
  });

  function validateAndSetAddress(val: string) {
    setInputAddress(val);
    if (val && !ETH_ADDRESS_REGEX.test(val)) {
      setAddressError('Endereço Ethereum inválido (deve começar com 0x e ter 42 caracteres)');
    } else {
      setAddressError('');
    }
  }

  function handleAnalyze() {
    if (!ETH_ADDRESS_REGEX.test(inputAddress)) {
      setAddressError('Endereço Ethereum inválido');
      return;
    }
    setAnalyzingAddress(inputAddress.toLowerCase());
  }

  function handleAddWallet() {
    if (!ETH_ADDRESS_REGEX.test(inputAddress)) {
      setAddressError('Endereço Ethereum inválido');
      return;
    }
    addMutation.mutate({ address: inputAddress, label: inputLabel || undefined });
  }

  function handleSelectWallet(address: string) {
    setInputAddress(address);
    setAddressError('');
    setAnalyzingAddress(address);
  }

  const totalPositions = positions?.reduce((sum, chain) => sum + chain.positions.length, 0) ?? 0;
  const inRangeCount = positions?.reduce(
    (sum, chain) => sum + chain.positions.filter(p => p.inRange).length,
    0
  ) ?? 0;

  const isDemo = positions?.some(c => c.positions.some(p => p.id.startsWith('demo-')));

  return (
    <MainLayout title="Wallet Tracker" subtitle="Rastreie posições de liquidez de wallets Ethereum">
      {/* Input section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Analisar Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="0x... endereço Ethereum"
                value={inputAddress}
                onChange={e => validateAndSetAddress(e.target.value)}
                className={cn('font-mono', addressError && 'border-destructive')}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              />
              {addressError && (
                <p className="text-xs text-destructive mt-1">{addressError}</p>
              )}
            </div>
            <Input
              placeholder="Label (opcional)"
              value={inputLabel}
              onChange={e => setInputLabel(e.target.value)}
              maxLength={50}
              className="w-40"
            />
            <Button onClick={handleAnalyze} disabled={!inputAddress || !!addressError}>
              Analisar
            </Button>
            <Button
              variant="outline"
              onClick={handleAddWallet}
              disabled={!inputAddress || !!addressError || addMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tracked wallets */}
      {(trackedWallets.length > 0 || walletsLoading) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Wallets Monitoradas</CardTitle>
          </CardHeader>
          <CardContent>
            {walletsLoading ? (
              <div className="flex gap-2 flex-wrap">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-8 w-36 rounded-full bg-secondary animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {trackedWallets.map(w => (
                  <div
                    key={w.address}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer transition-colors',
                      analyzingAddress === w.address
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-secondary/50 hover:border-primary/50'
                    )}
                    onClick={() => handleSelectWallet(w.address)}
                  >
                    <Wallet className="h-3 w-3" />
                    <span className="font-mono">{w.label || shortenAddress(w.address)}</span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        removeMutation.mutate(w.address);
                      }}
                      className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results section */}
      {analyzingAddress && (
        <div className="space-y-4">
          {/* Header bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-muted-foreground">
                {shortenAddress(analyzingAddress)}
              </span>
              {!positionsLoading && positions && (
                <>
                  <Badge variant="secondary">{totalPositions} posição{totalPositions !== 1 ? 'ões' : ''}</Badge>
                  <Badge
                    variant="outline"
                    className={cn(inRangeCount > 0 ? 'border-green-500 text-green-500' : 'border-muted-foreground')}
                  >
                    {inRangeCount} in range
                  </Badge>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchPositions()}
              disabled={positionsFetching}
            >
              <RefreshCw className={cn('h-4 w-4', positionsFetching && 'animate-spin')} />
            </Button>
          </div>

          {/* Demo data warning */}
          {isDemo && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Dados de demonstração exibidos. Configure <code className="text-xs bg-secondary px-1 rounded">THEGRAPH_API_KEY</code> no backend para buscar posições reais via The Graph.
              </AlertDescription>
            </Alert>
          )}

          {/* Error state */}
          {positionsError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Erro ao buscar posições. Verifique o endereço e tente novamente.</AlertDescription>
            </Alert>
          )}

          {/* Loading skeleton */}
          {positionsLoading && (
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="glass-card p-4 space-y-3">
                  <div className="h-5 w-24 bg-secondary animate-pulse rounded" />
                  <div className="space-y-2">
                    {[...Array(2)].map((_, j) => (
                      <div key={j} className="h-20 bg-secondary animate-pulse rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Positions grouped by chain */}
          {!positionsLoading && positions && (
            <>
              {positions.length === 0 ? (
                <div className="glass-card p-12 text-center">
                  <Wallet className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Nenhuma posição ativa</h3>
                  <p className="text-muted-foreground">
                    Esta wallet não possui posições abertas em Uniswap V3 nas chains suportadas.
                  </p>
                </div>
              ) : (
                positions.map(chainData => (
                  <div key={chainData.chain} className="glass-card p-4 animate-slide-up">
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: CHAIN_COLORS[chainData.chain] ?? '#888' }}
                      />
                      <h3 className="font-semibold capitalize">{chainData.chain}</h3>
                      <Badge variant="secondary" className="text-[10px]">
                        {chainData.positions.length} posição{chainData.positions.length !== 1 ? 'ões' : ''}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {chainData.positions.map(position => (
                        <PositionCard key={position.id} position={position} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}

      {/* Empty state — no address yet */}
      {!analyzingAddress && (
        <div className="glass-card p-12 text-center">
          <Wallet className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Rastreamento Multi-Wallet</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Digite um endereço Ethereum acima para visualizar suas posições de liquidez em Uniswap V3
            nas chains suportadas (Ethereum, Arbitrum, Base, Polygon).
          </p>
        </div>
      )}
    </MainLayout>
  );
}

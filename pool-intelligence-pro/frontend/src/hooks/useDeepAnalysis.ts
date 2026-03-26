import { useQuery } from '@tanstack/react-query';
import { fetchDeepAnalysis, type DeepAnalysisData } from '@/api/client';

interface UseDeepAnalysisOptions {
  timeframe?: 'hour' | 'day';
  enabled?: boolean;
}

interface UseDeepAnalysisResult {
  data: DeepAnalysisData | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useDeepAnalysis(
  chain: string | undefined,
  address: string | undefined,
  options: UseDeepAnalysisOptions = {}
): UseDeepAnalysisResult {
  const { timeframe = 'hour', enabled = true } = options;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['deep-analysis', chain, address, timeframe],
    queryFn: () => {
      if (!chain || !address) return null;
      return fetchDeepAnalysis(chain, address, timeframe);
    },
    enabled: enabled && !!chain && !!address,
    staleTime: timeframe === 'hour' ? 300_000 : 900_000,
    refetchInterval: timeframe === 'hour' ? 600_000 : 1_800_000,
    retry: 2,
  });

  return { data, isLoading, error: error as Error | null, refetch };
}

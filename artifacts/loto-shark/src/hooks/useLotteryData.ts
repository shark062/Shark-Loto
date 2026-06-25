import { useQuery } from "@tanstack/react-query";
import type { LotteryType, LotteryDraw, NextDrawInfo, NumberFrequency, UserStats } from "@/types/lottery";
import {
  LOTTERIES,
  getLotteryDraws,
  getNextDraw,
  getPrizes,
  getFrequencies,
} from "@/lib/caixaApi";
import { resolveApiUrl } from "@/lib/queryClient";

export function useLotteryTypes() {
  return useQuery<LotteryType[]>({
    queryKey: ["caixa/lotteries"],
    queryFn: () => Promise.resolve(LOTTERIES as LotteryType[]),
    staleTime: Infinity,
  });
}

export function useLotteryDraws(lotteryId?: string, _limit = 10) {
  return useQuery<LotteryDraw[]>({
    queryKey: ["caixa/draws", lotteryId],
    queryFn: () => getLotteryDraws(lotteryId!),
    enabled: !!lotteryId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useNextDrawInfo(lotteryId?: string) {
  return useQuery<NextDrawInfo>({
    queryKey: ["caixa/next-draw", lotteryId],
    queryFn: () => getNextDraw(lotteryId!) as Promise<NextDrawInfo>,
    enabled: !!lotteryId,
    staleTime: 0,
    refetchInterval: 30 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useNumberFrequencies(lotteryId?: string) {
  return useQuery<NumberFrequency[]>({
    queryKey: ["caixa/frequencies", lotteryId],
    queryFn: async () => {
      const result = await getFrequencies(lotteryId!, 30);
      return result.frequencies as NumberFrequency[];
    },
    enabled: !!lotteryId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useFrequencyAnalysis(lotteryId?: string) {
  return useQuery<{ frequencies: NumberFrequency[]; meta: any }>({
    queryKey: ["caixa/frequencies", lotteryId],
    queryFn: () => getFrequencies(lotteryId!, 30) as Promise<{ frequencies: NumberFrequency[]; meta: any }>,
    enabled: !!lotteryId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useUserStats() {
  return useQuery<UserStats>({
    queryKey: ["/api/users/stats"],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/users/stats"), { credentials: "omit" });
      if (!res.ok) return { totalGames: 0, totalChecked: 0, wins: 0, winRate: 0, totalPrize: 0 };
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });
}

export interface LotteryPrizeTier {
  tier: number;
  name: string;
  winners: number;
  prizeAmount: number;
  prizeFormatted: string;
  isAccumulated: boolean;
}

export interface LotteryPrizes {
  lotteryId: string;
  contestNumber: number;
  nextContest: number;
  drawDate: string | null;
  accumulated: boolean;
  estimatedPrize: number;
  estimatedPrizeFormatted: string;
  prizes: LotteryPrizeTier[];
}

export function useLotteryPrizes(lotteryId?: string) {
  return useQuery<LotteryPrizes>({
    queryKey: ["caixa/prizes", lotteryId],
    queryFn: () => getPrizes(lotteryId!) as Promise<LotteryPrizes>,
    enabled: !!lotteryId,
    staleTime: 0,
    refetchInterval: 30 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

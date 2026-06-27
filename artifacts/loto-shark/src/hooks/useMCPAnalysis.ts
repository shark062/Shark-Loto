import { useState } from "react";

export interface MCPAnalysisResult {
  success: boolean;
  query: string;
  lottery_id: string;
  lottery_name: string;
  analysis: string;
  metadata?: {
    source: string;
    validation: string;
    model: string;
    timestamp: string;
  };
  error?: string;
}

export interface MCPDataResult {
  lottery_id: string;
  lottery_name: string;
  draws_analyzed: number;
  source: string;
  top_frequent: Array<{ number: number; frequency: number; temperature: string }>;
  least_frequent: Array<{ number: number; frequency: number; temperature: string }>;
  avg_sum: number;
  recent_draws: Array<{ index: number; numbers: number[] }>;
  disclaimer: string;
}

export function useMCPAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MCPAnalysisResult | null>(null);

  const analyze = async (query: string, lotteryId: string): Promise<MCPAnalysisResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mcp/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, lottery_id: lotteryId }),
      });

      const data: MCPAnalysisResult = await response.json();

      if (!response.ok) {
        const errMsg = (data as any).error ?? "Erro na análise";
        setError(errMsg);
        return null;
      }

      setResult(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (lotteryId: string, limit = 30): Promise<MCPDataResult | null> => {
    try {
      const response = await fetch(`/api/mcp/data/${lotteryId}?limit=${limit}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { analyze, fetchData, loading, error, result, reset };
}

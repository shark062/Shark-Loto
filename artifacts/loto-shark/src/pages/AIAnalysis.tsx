import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLotteryTypes, useUserStats } from "@/hooks/useLotteryData";
import { apiFetch, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MCPAnalyzer } from "@/components/MCPAnalyzer";
import { 
  Brain, 
  TrendingUp, 
  Target, 
  Sparkles,
  BarChart3,
  Lightbulb,
  RefreshCw,
  Zap,
  AlertCircle,
  CheckCircle,
  Activity,
  Eye,
  Calculator,
  Calendar,
  Trophy,
  DollarSign,
  Database
} from "lucide-react";

interface AIAnalysisResult {
  id: number;
  lotteryId: string;
  analysisType: string;
  result: any;
  confidence: string;
  createdAt: string;
}

interface PatternAnalysis {
  pattern: string;
  frequency: number;
  lastOccurrence: string;
  predictedNext: number[];
}

interface PredictionResult {
  primaryPrediction: number[];
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    numbers: number[];
    strategy: string;
  }>;
  riskLevel: string;
}

interface StrategyRecommendation {
  recommendedStrategy: string;
  reasoning: string;
  numberSelection: {
    hotPercentage: number;
    warmPercentage: number;
    coldPercentage: number;
  };
  riskLevel: string;
  playFrequency: string;
  budgetAdvice: string;
  expectedImprovement: string;
}

interface GameResult {
  id: string;
  lotteryId: string;
  contestNumber: number;
  numbersDrawn: number[];
  prizeWon: string;
  matches: number;
  createdAt: string;
}

const CARD_STYLE: React.CSSProperties = {
  background: "rgba(10, 15, 30, 0.82)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
};

const TAB_ACTIVE_STYLE: React.CSSProperties = {
  background: "rgba(60, 20, 120, 0.75)",
  border: "1px solid rgba(139, 92, 246, 0.55)",
  color: "#ffffff",
};

const TAB_INACTIVE_STYLE: React.CSSProperties = {
  background: "rgba(12, 14, 40, 0.62)",
  border: "1px solid rgba(255, 255, 255, 0.13)",
  color: "#ffffff",
};

export default function AIAnalysis() {
  const [, setLocation] = useLocation();
  const [selectedLottery, setSelectedLottery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'mcp'>('mcp');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [realPrediction, setRealPrediction] = useState<any>(null);
  const [isLoadingRealPrediction, setIsLoadingRealPrediction] = useState(false);
  const { toast } = useToast();

  // Data queries
  const { data: lotteryTypes } = useLotteryTypes();
  const { data: userStats } = useUserStats();

  // AI Analysis queries - sempre busca dados reais da API
  const { data: patternAnalysis, isLoading: patternLoading, refetch: refetchPattern } = useQuery<AIAnalysisResult>({
    queryKey: [`/api/ai/analysis/${selectedLottery}/pattern`],
    queryFn: async () => {
      const res = await apiFetch(`/api/ai/analysis/${selectedLottery}?type=pattern`);
      if (!res.ok) throw new Error('Failed to fetch pattern analysis');
      return res.json();
    },
    enabled: !!selectedLottery && activeTab === 'pattern',
    staleTime: 2 * 60 * 1000, // 2 minutos
    refetchOnMount: true,
  });

  const { data: predictionAnalysis, isLoading: predictionLoading, refetch: refetchPrediction } = useQuery<AIAnalysisResult>({
    queryKey: [`/api/ai/analysis/${selectedLottery}/prediction`],
    queryFn: async () => {
      const res = await apiFetch(`/api/ai/analysis/${selectedLottery}?type=prediction`);
      if (!res.ok) throw new Error('Failed to fetch prediction analysis');
      return res.json();
    },
    enabled: !!selectedLottery && activeTab === 'prediction',
    staleTime: 2 * 60 * 1000,
    refetchOnMount: true,
  });

  const { data: strategyAnalysis, isLoading: strategyLoading, refetch: refetchStrategy } = useQuery<AIAnalysisResult>({
    queryKey: [`/api/ai/analysis/${selectedLottery}/strategy`],
    queryFn: async () => {
      const res = await apiFetch(`/api/ai/analysis/${selectedLottery}?type=strategy`);
      if (!res.ok) throw new Error('Failed to fetch strategy analysis');
      return res.json();
    },
    enabled: !!selectedLottery && activeTab === 'strategy',
    staleTime: 2 * 60 * 1000,
    refetchOnMount: true,
  });

  // Mock AI analysis data for demonstration purposes if needed
  const aiAnalysis = predictionAnalysis?.result || patternAnalysis?.result || strategyAnalysis?.result;


  // Generate new analysis mutation
  const analyzeWithAI = useMutation({
    mutationFn: async (analysisType: string) => {
      const response = await apiRequest('POST', '/api/ai/analyze', {
        lotteryId: selectedLottery,
        analysisType,
      });
      return response.json();
    },
    onSuccess: (data, analysisType) => {
      // Refetch the appropriate analysis
      if (analysisType === 'pattern') refetchPattern();
      else if (analysisType === 'prediction') refetchPrediction();
      else if (analysisType === 'strategy') refetchStrategy();

      toast({
        title: "Análise Concluída",
        description: "A IA terminou a análise com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro na Análise",
        description: "Não foi possível completar a análise. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = async (analysisType: string) => {
    setIsAnalyzing(true);
    try {
      await analyzeWithAI.mutateAsync(analysisType);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLoadRealPrediction = async () => {
    if (!selectedLottery) return;
    setIsLoadingRealPrediction(true);
    try {
      const response = await apiFetch(`/api/prediction/generate/${selectedLottery}`);
      if (!response.ok) throw new Error('Failed to load prediction');
      const data = await response.json();
      setRealPrediction(data);
      toast({
        title: "Prognóstico Real Carregado",
        description: `${data.lotteryName} - Confiança: ${data.confidence.toFixed(0)}%`,
      });
    } catch (error) {
      toast({
        title: "Erro ao Carregar Prognóstico",
        description: "Tente novamente em alguns momentos.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingRealPrediction(false);
    }
  };

  const selectedLotteryData = lotteryTypes?.find(l => l.id === selectedLottery);

  const getConfidenceColor = (confidence: string | number) => {
    const conf = typeof confidence === 'string' ? parseFloat(confidence) : confidence;
    if (conf >= 0.8) return "text-neon-green";
    if (conf >= 0.6) return "text-accent";
    if (conf >= 0.4) return "text-amber-500";
    return "text-destructive";
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel?.toLowerCase()) {
      case 'low': case 'conservative': return "text-neon-green";
      case 'medium': case 'balanced': return "text-accent";
      case 'high': case 'aggressive': return "text-destructive";
      default: return "text-muted-foreground";
    }
  };

  const aiLearningProgress = userStats ? Math.min(100, Math.floor((userStats.totalGames / 100) * 100)) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold neon-text text-primary mb-2" data-testid="ai-analysis-title">
            Análises Inteligentes 🤖
          </h2>
          <p className="text-muted-foreground">
            Análise avançada com inteligência artificial para otimizar suas estratégias
          </p>
        </div>

        {/* AI Status Overview */}
        <Card className="analysis-card" style={CARD_STYLE}>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-col items-center text-center">
                <Brain className="h-7 w-7 mb-2 text-secondary" />
                <div className="text-xl font-bold text-secondary neon-text" data-testid="ai-level">
                  Nível {Math.min(10, Math.floor((userStats?.totalGames || 0) / 10) + 1)}
                </div>
                <div className="text-xs text-muted-foreground">Sistema IA</div>
              </div>

              <div className="flex flex-col items-center text-center">
                <Activity className="h-7 w-7 mb-2 text-primary" />
                <div className="text-xl font-bold text-primary neon-text" data-testid="learning-progress">
                  {aiLearningProgress}%
                </div>
                <div className="text-xs text-muted-foreground">Aprendizado ({userStats?.totalGames || 0} jogos)</div>
                <Progress value={aiLearningProgress} className="mt-2 h-1.5 w-full" />
              </div>

              <div className="flex flex-col items-center text-center">
                <Target className="h-7 w-7 mb-2 text-accent" />
                <div className="text-xl font-bold text-accent neon-text" data-testid="accuracy-improvement">
                  {userStats ? `${((userStats.wins || 0) / (userStats.totalGames || 1) * 100).toFixed(1)}%` : '0%'}
                </div>
                <div className="text-xs text-muted-foreground">Taxa de Acerto</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-8">
          <Select value={selectedLottery} onValueChange={setSelectedLottery}>
            <SelectTrigger className="w-64 neon-border glass-panel text-white">
              <SelectValue placeholder="Selecione a modalidade" />
            </SelectTrigger>
            <SelectContent className="neon-border">
              {lotteryTypes?.map((lottery) => (
                <SelectItem key={lottery.id} value={lottery.id} className="text-white hover:bg-primary/20">
                  {lottery.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>

        {/* Analysis Content */}
        <div className="space-y-6">
          <Card className="analysis-card" style={CARD_STYLE}>
            <CardContent className="p-5">
              <MCPAnalyzer />
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="text-center mt-8">
          <div className="inline-flex gap-4">
            <Button 
              onClick={() => setLocation('/generator')}
              className="bg-white/[0.04]"
              data-testid="go-to-generator-button"
            >
              <Zap className="h-4 w-4 mr-2" />
              Ir para Gerador
            </Button>

            <Button 
              onClick={() => setLocation('/heat-map')}
              variant="outline"
              className="border-primary text-primary hover:bg-black/20"
              data-testid="view-heatmap-button"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Ver Mapa de Calor
            </Button>
          </div>
        </div>
      </main>

      {/* Developer Footer */}
      <footer className="text-center py-4 mt-8 border-t border-border/20">
        <p className="text-xs text-muted-foreground">
          powered by <span className="text-accent font-semibold">Shark062</span>
        </p>
      </footer>
    </div>
  );
}
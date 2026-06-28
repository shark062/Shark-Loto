import React, { useState } from "react";
import { useLocation } from "wouter";
import Navigation from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLotteryTypes, useUserStats } from "@/hooks/useLotteryData";
import { Brain, Target, BarChart3, Zap, Activity } from "lucide-react";

const CARD_STYLE: React.CSSProperties = {
  background: "rgba(10, 15, 30, 0.82)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
};

export default function AIAnalysis() {
  const [, setLocation] = useLocation();
  const [selectedLottery, setSelectedLottery] = useState<string>('');

  const { data: lotteryTypes } = useLotteryTypes();
  const { data: userStats } = useUserStats();

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
        <Card className="analysis-card mb-6" style={CARD_STYLE}>
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

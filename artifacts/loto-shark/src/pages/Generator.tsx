import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLotteryTypes } from "@/hooks/useLotteryData";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dice6,
  Sparkles,
  Zap,
  Flame,
  Snowflake,
  Sun,
  Brain,
  Copy,
  Share,
  RefreshCw,
  Target,
  Settings,
  CheckCircle2,
  Trash2,
  Info,
  TrendingUp,
  BookOpen,
  Award,
  RotateCcw,
  BarChart3,
} from "lucide-react";
import type { UserGame, LotteryType } from "@/types/lottery";
import {
  salvarJogos,
  carregarPesos,
  ajustarPesos,
  registrarResultadoOficial,
  analisarPerformance,
  estatisticasGerais,
  resetarMemoria,
  type SharkPesos,
} from "@/core/sharkMemory";
import { gerarRelatorio, getEmojiEstrategia, type Relatorio } from "@/core/sharkAnalytics";
import { salvarJogosGerados, toSavedGame } from "@/core/sharkSavedGames";
import BettingPlatformIntegration from "@/components/BettingPlatformIntegration";

const generateGameSchema = z.object({
  lotteryId: z.string().min(1, "Selecione uma modalidade"),
  numbersCount: z.number().min(1).optional(),
  gamesCount: z.number().min(1).max(100).optional(),
  strategy: z.enum(['hot', 'cold', 'mixed', 'ai', 'shark', 'manual']),
}).superRefine((data, ctx) => {
  if (data.strategy !== 'manual') {
    if (!data.numbersCount || data.numbersCount < 1) ctx.addIssue({ code: 'custom', message: 'Informe a quantidade de dezenas', path: ['numbersCount'] });
    if (!data.gamesCount  || data.gamesCount  < 1) ctx.addIssue({ code: 'custom', message: 'Informe a quantidade de jogos',   path: ['gamesCount']  });
  }
});

type GenerateGameForm = z.infer<typeof generateGameSchema>;

interface GeneratedGame {
  numbers: number[];
  strategy: string;
  confidence?: number;
  reasoning?: string;
  sharkScore?: number;
  sharkOrigem?: string;
  sharkContexto?: {
    hot: number[];
    warm: number[];
    cold: number[];
    totalCandidatos: number;
    totalValidados: number;
  };
  rawGame?: any;
}

export default function Generator() {
  const [location, setLocation] = useLocation();
  const [generatedGames, setGeneratedGames] = useState<GeneratedGame[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [sharkRawGames, setSharkRawGames] = useState<any[]>([]);
  const [sharkPesos, setSharkPesos] = useState<SharkPesos>({ frequencia: 0.5, atraso: 0.3, repeticao: 0.2 });
  const [sharkStats, setSharkStats] = useState<ReturnType<typeof estatisticasGerais> | null>(null);
  const [showMemoriaPanel, setShowMemoriaPanel] = useState(false);
  const [resultInput, setResultInput] = useState("");
  const [showRegistrar, setShowRegistrar] = useState(false);
  const [relatorio, setRelatorio] = useState<Relatorio>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const pesos = ajustarPesos();
    setSharkPesos(pesos);
    setSharkStats(estatisticasGerais());
    setRelatorio(gerarRelatorio());
  }, []);

  const clearGeneratedGames = () => {
    setGeneratedGames([]);
    setSharkRawGames([]);
    toast({ title: "Jogos Limpos!", description: "Todos os jogos foram removidos." });
  };

  // Parse URL parameters
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const preselectedLottery = urlParams.get('lottery');
  const preselectedNumber = urlParams.get('number');

  // Estado para selectedLotteryId - inicializa com valor da URL se disponível
  const [selectedLotteryId, setSelectedLotteryId] = useState<string>(preselectedLottery || '');

  // Data queries
  const { data: lotteryTypes, isLoading: lotteriesLoading } = useLotteryTypes();
  const { data: frequenciesRaw } = useQuery({
    queryKey: ["/api/lotteries", selectedLotteryId, "frequency"],
    enabled: !!selectedLotteryId,
    select: (data: any) => {
      const arr = Array.isArray(data) ? data : (data?.frequencies ?? []);
      const meta = Array.isArray(data) ? {} : (data?.meta ?? {});
      return { frequencies: arr, meta };
    },
  });
  const frequencies = frequenciesRaw?.frequencies ?? [];
  const frequencyMeta = frequenciesRaw?.meta ?? {};

  // Form setup
  const form = useForm<GenerateGameForm>({
    resolver: zodResolver(generateGameSchema),
    defaultValues: {
      lotteryId: preselectedLottery || '',
      numbersCount: undefined,
      gamesCount: undefined,
      strategy: 'shark' as const,
    },
  });

  // Atualiza o estado local selectedLotteryId sempre que o valor do formulário mudar
  useEffect(() => {
    const subscription = form.watch((value) => {
      if (value.lotteryId !== undefined && value.lotteryId !== selectedLotteryId) {
        setSelectedLotteryId(value.lotteryId);
      }
    });
    return () => subscription.unsubscribe();
  }, [selectedLotteryId]);


  const selectedLottery = lotteryTypes?.find(l => l.id === selectedLotteryId);

  // Preenche automaticamente dezenas com o mínimo da modalidade ao trocar
  useEffect(() => {
    if (selectedLottery) {
      form.setValue('numbersCount', selectedLottery.minNumbers);
    }
  }, [selectedLottery?.id]);

  // Generate games mutation
  const generateGamesMutation = useMutation({
    mutationFn: async (data: GenerateGameForm) => {
      const payload: any = { ...data };
      if (data.strategy === 'shark') {
        payload.pesos = carregarPesos();
      }
      const response = await apiRequest('POST', '/api/games/generate', payload);
      return response.json();
    },
    onSuccess: (data) => {
      const isShark = data[0]?.strategy === 'shark';
      setGeneratedGames(data.map((game: any) => ({
        numbers: game.selectedNumbers,
        strategy: game.strategy || 'mixed',
        confidence: game.confidence,
        reasoning: game.reasoning,
        sharkScore: game.sharkScore,
        sharkOrigem: game.sharkOrigem,
        sharkContexto: game.sharkContexto,
        rawGame: game,
      })));
      if (isShark) {
        setSharkRawGames(data);
        setShowRegistrar(false);
        setResultInput("");
        // Salva na memória
        salvarJogos(
          data.map((g: any) => ({ jogo: g.selectedNumbers, score: g.sharkScore || 0, origem: g.sharkOrigem || 'master' })),
          data[0]?.lotteryId || form.getValues('lotteryId'),
        );
        setSharkStats(estatisticasGerais());
      } else {
        setSharkRawGames([]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/games"] });
      toast({
        title: "Jogos Gerados!",
        description: `${data.length} jogo(s) gerado(s) e salvos com sucesso.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao Gerar Jogos",
        description: "Não foi possível gerar os jogos. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: GenerateGameForm) => {
    // Modo manual
    if (data.strategy === 'manual') {
      if (selectedNumbers.length === 0) {
        toast({ title: "Selecione números", description: "Selecione pelo menos 1 número.", variant: "destructive" });
        return;
      }
      setGeneratedGames([{ numbers: selectedNumbers, strategy: 'manual' }]);
      toast({ title: "Jogo criado!", description: "Seus números foram selecionados com sucesso." });
      return;
    }

    // Modo automático: gerar jogos com IA
    setIsGenerating(true);
    try {
      await generateGamesMutation.mutateAsync(data);
    } finally {
      setIsGenerating(false);
    }
  };

  const getNumberFrequency = (number: number) => {
    return (frequencies as any[]).find((f: any) => f.number === number);
  };

  const toggleNumber = (number: number) => {
    if (!selectedLottery) return;

    if (selectedNumbers.includes(number)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== number));
    } else {
      setSelectedNumbers([...selectedNumbers, number].sort((a, b) => a - b));
    }
  };

  const clearSelection = () => {
    setSelectedNumbers([]);
  };

  // Limpar seleção ao trocar de modalidade
  useEffect(() => {
    setSelectedNumbers([]);
  }, [selectedLotteryId]);

  const getStrategyInfo = (strategy: string) => {
    const strategies = {
      hot: {
        icon: <Flame className="h-4 w-4 text-destructive" />,
        emoji: '🔥',
        name: 'Números Quentes',
        description: 'Foca nos números que mais saem',
        color: 'text-destructive',
      },
      cold: {
        icon: <Snowflake className="h-4 w-4 text-primary" />,
        emoji: '❄️',
        name: 'Números Frios',
        description: 'Foca nos números que menos saem',
        color: 'text-primary',
      },
      mixed: {
        icon: <Sun className="h-4 w-4 text-amber-500" />,
        emoji: '♨️',
        name: 'Estratégia Mista',
        description: '40% quentes, 30% mornos, 30% frios',
        color: 'text-amber-500',
      },
      ai: {
        icon: <Brain className="h-4 w-4 text-secondary" />,
        emoji: '🤖',
        name: 'IA Avançada',
        description: 'Análise inteligente com padrões',
        color: 'text-secondary',
      },
      shark: {
        icon: <Brain className="h-4 w-4 text-primary" />,
        emoji: '',
        name: 'Predições com IA',
        description: 'Motor autônomo: simula milhares de combinações e seleciona as melhores com aprendizado contínuo',
        color: 'text-primary',
      },
      manual: {
        icon: <Target className="h-4 w-4 text-accent" />,
        emoji: '🎯',
        name: 'Escolha Manual',
        description: 'Selecione seus próprios números',
        color: 'text-accent',
      },
    };
    return strategies[strategy as keyof typeof strategies] || strategies.mixed;
  };

  const getNumberStyle = (number: number, strategy: string) => {
    const baseStyle = "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold";
    const colorStyle = "text-white"; // White numbers as requested

    if (strategy === 'hot') {
      return `${baseStyle} ${colorStyle} bg-red-500`;
    } else if (strategy === 'cold') {
      return `${baseStyle} ${colorStyle} bg-blue-500`;
    } else if (strategy === 'mixed') {
      const mod = number % 3;
      if (mod === 0) return `${baseStyle} ${colorStyle} bg-orange-500`; // Warm
      if (mod === 1) return `${baseStyle} ${colorStyle} bg-red-500`; // Hot
      return `${baseStyle} ${colorStyle} bg-blue-500`; // Cold
    } else if (strategy === 'ai') {
      return `${baseStyle} ${colorStyle} bg-purple-500`;
    } else if (strategy === 'shark') {
      return `${baseStyle} ${colorStyle} bg-yellow-500`;
    }
    return `${baseStyle} ${colorStyle} bg-gray-500`; // Default neutral color
  };


  const copyToClipboard = (numbers: number[]) => {
    const text = numbers.join(' - ');
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "Números copiados para a área de transferência.",
    });
  };


  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <main className="container mx-auto px-4 py-4">
        <div className="text-center mb-4">
          <div>
            <h2 className="text-2xl font-bold neon-text text-primary mb-1" data-testid="generator-title">
              Gerador Inteligente 🔮
            </h2>
            <p className="text-sm text-muted-foreground">
              Gere jogos com estratégias baseadas em IA e análise estatística
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Generator Form */}
          <Card className="sk-card">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Configurações do Jogo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Lottery Selection */}
                <div>
                  <Label className="flex items-center text-sm font-medium text-foreground mb-2">
                    <Target className="h-4 w-4 mr-2 text-primary" />
                    Modalidade
                  </Label>
                  <Select
                    value={form.watch('lotteryId')}
                    onValueChange={(value) => {
                      form.setValue('lotteryId', value);
                      // O useEffect acima irá capturar essa mudança e atualizar setSelectedLotteryId
                    }}
                    disabled={lotteriesLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a modalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {lotteryTypes?.map((lottery) => (
                        <SelectItem key={lottery.id} value={lottery.id}>
                          {lottery.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.lotteryId && (
                    <p className="text-destructive text-sm mt-1">{form.formState.errors.lotteryId.message}</p>
                  )}
                </div>

                {/* Numbers Count — hidden for manual mode */}
                {form.watch('strategy') !== 'manual' && (
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label className="flex items-center text-sm font-medium text-foreground mb-2">
                        <Dice6 className="h-4 w-4 mr-2 text-accent" />
                        Dezenas
                        {selectedLottery && (
                          <span className="ml-2 text-xs text-muted-foreground font-normal">
                            (mín. {selectedLottery.minNumbers} — máx. {selectedLottery.totalNumbers})
                          </span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        placeholder={selectedLottery ? `Mín. ${selectedLottery.minNumbers}` : "Dezenas"}
                        min={selectedLottery?.minNumbers ?? 1}
                        max={selectedLottery?.totalNumbers ?? 60}
                        {...form.register('numbersCount', { valueAsNumber: true })}
                        className="bg-input border-border"
                        data-testid="numbers-count-input"
                      />
                      {form.formState.errors.numbersCount && (
                        <p className="text-destructive text-xs mt-1">{form.formState.errors.numbersCount.message}</p>
                      )}
                    </div>

                    <div>
                      <Label className="flex items-center text-sm font-medium text-foreground mb-2">
                        <Copy className="h-4 w-4 mr-2 text-secondary" />
                        Qtd. Jogos
                        <span className="ml-2 text-xs text-muted-foreground font-normal">(máx. 100)</span>
                      </Label>
                      <Input
                        type="number"
                        placeholder="Ex: 5"
                        min={1}
                        max={100}
                        {...form.register('gamesCount', { valueAsNumber: true })}
                        className="bg-input border-border"
                        data-testid="games-count-input"
                      />
                      {form.formState.errors.gamesCount && (
                        <p className="text-destructive text-xs mt-1">{form.formState.errors.gamesCount.message}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Strategy — single fixed option */}
                <Card className="sk-card border-primary/50 shadow-lg shadow-primary/20">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-full bg-primary/30">
                          <Brain className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-primary">Predições com IA</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Motor autônomo: simula milhares de combinações e seleciona as melhores com aprendizado contínuo
                          </p>
                        </div>
                      </div>
                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0 ml-3">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Manual Number Selection */}
                {form.watch('strategy') === 'manual' && selectedLottery && (
                  <Card className="sk-card">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-medium text-accent flex items-center">
                          <Target className="h-4 w-4 mr-2" />
                          Cartela - {selectedLottery.displayName}
                        </h5>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {selectedNumbers.length} números
                          </Badge>
                          {selectedNumbers.length > 0 && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                      </div>

                      {/* Grid de números - Cartela estilo mapa de calor */}
                      <div className="glass-card rounded-xl p-3 mb-3 shadow-lg">
                        <div
                          className="number-grid"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${selectedLottery.totalNumbers <= 25 ? 5 : selectedLottery.totalNumbers <= 35 ? 7 : 10}, minmax(0, 1fr))`,
                            gap: '6px',
                          }}
                        >
                          {Array.from({ length: selectedLottery.totalNumbers }, (_, i) => {
                            const startNum = ['lotomania', 'supersete'].includes(selectedLottery.id) ? 0 : 1;
                            const number = i + startNum;
                            const isSelected = selectedNumbers.includes(number);
                            const freq = getNumberFrequency(number);
                            const temp = freq?.temperature || 'cold';

                            return (
                              <button
                                key={number}
                                type="button"
                                onClick={() => toggleNumber(number)}
                                className={`
                                  relative aspect-square rounded-full p-0 overflow-hidden
                                  transition-all duration-200
                                  ${isSelected
                                    ? temp === 'hot'
                                      ? 'ring-2 ring-red-400 shadow-lg shadow-red-500/60 scale-110 z-10'
                                      : temp === 'warm'
                                      ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-500/60 scale-110 z-10'
                                      : 'ring-2 ring-blue-400 shadow-lg shadow-blue-500/60 scale-110 z-10'
                                    : 'ring-1 ring-white/20 hover:ring-white/50 hover:scale-105'
                                  }
                                `}
                              >
                                <img
                                  src={`/dezenas/dezena_${number.toString().padStart(2, '0')}.svg`}
                                  alt={number.toString().padStart(2, '0')}
                                  className="w-full h-full block"
                                  draggable={false}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Números selecionados */}
                      {selectedNumbers.length > 0 && (
                        <div className="space-y-2 border-t border-primary/30 pt-2 mt-2">
                          <div className="bg-gradient-to-r from-black/50 to-black/30 rounded-xl p-2.5 border border-primary/20">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Seus números selecionados:
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={clearSelection}
                                className="h-6 text-xs text-muted-foreground hover:text-destructive px-2"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Limpar
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedNumbers.map((num) => {
                                const freq = getNumberFrequency(num);
                                const temp = freq?.temperature || 'cold';
                                return (
                                  <img
                                    key={num}
                                    src={`/dezenas/dezena_${num.toString().padStart(2, '0')}.svg`}
                                    alt={num.toString().padStart(2, '0')}
                                    draggable={false}
                                    className={`w-9 h-9 transition-all duration-200 ${
                                      temp === 'hot' ? '[filter:drop-shadow(0_0_6px_rgba(255,60,60,0.9))]' :
                                      temp === 'warm' ? '[filter:drop-shadow(0_0_6px_rgba(255,200,0,0.9))]' :
                                      '[filter:drop-shadow(0_0_6px_rgba(0,200,255,0.9))]'
                                    }`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Legenda compacta */}
                      <div className="bg-white/[0.04] rounded-lg p-2 mt-2 border border-white/10">
                        <div className="flex justify-center gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-red-500 shadow-sm shadow-red-500/50"></div>
                            <span className="font-medium">🔥 Quentes</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-yellow-500 shadow-sm shadow-yellow-500/50"></div>
                            <span className="font-medium">♨️ Mornos</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-blue-500 shadow-sm shadow-blue-500/50"></div>
                            <span className="font-medium">❄️ Frios</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}


                {/* Strategy Details */}
                {form.watch('strategy') && form.watch('strategy') !== 'manual' && (
                  <Card className="sk-card">
                    <CardContent className="p-3">
                      <h5 className="font-medium text-accent mb-2 flex items-center">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Como Funciona: {getStrategyInfo(form.watch('strategy')).name}
                      </h5>
                      <div className="space-y-2">
                        {form.watch('strategy') === 'hot' && (
                          <div className="text-sm text-muted-foreground">
                            <div className="flex items-center mb-2">
                              <Flame className="h-4 w-4 mr-2 text-destructive" />
                              <span className="font-medium">Foco em números frequentes</span>
                            </div>
                            <ul className="space-y-1 ml-6">
                              <li>• Seleciona números que saíram mais vezes recentemente</li>
                              <li>• Baseado na tendência de repetição</li>
                              <li>• Ideal para quem acredita em "sequências quentes"</li>
                            </ul>
                          </div>
                        )}
                        {form.watch('strategy') === 'cold' && (
                          <div className="text-sm text-muted-foreground">
                            <div className="flex items-center mb-2">
                              <Snowflake className="h-4 w-4 mr-2 text-primary" />
                              <span className="font-medium">Foco em números atrasados</span>
                            </div>
                            <ul className="space-y-1 ml-6">
                              <li>• Seleciona números que não saem há mais tempo</li>
                              <li>• Baseado na teoria de compensação</li>
                              <li>• Ideal para quem acredita que "tudo se equilibra"</li>
                            </ul>
                          </div>
                        )}
                        {form.watch('strategy') === 'mixed' && (
                          <div className="text-sm text-muted-foreground">
                            <div className="flex items-center mb-2">
                              <Sun className="h-4 w-4 mr-2 text-amber-500" />
                              <span className="font-medium">Estratégia equilibrada</span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 mb-3">
                              <div className="text-center p-2 bg-black/20 rounded">
                                <div className="font-bold text-destructive">40%</div>
                                <div className="text-xs">🔥 Quentes</div>
                              </div>
                              <div className="text-center p-2 bg-amber-500/10 rounded">
                                <div className="font-bold text-amber-500">30%</div>
                                <div className="text-xs">♨️ Mornos</div>
                              </div>
                              <div className="text-center p-2 bg-black/20 rounded">
                                <div className="font-bold text-primary">30%</div>
                                <div className="text-xs">❄️ Frios</div>
                              </div>
                            </div>
                            <p className="text-xs">Combina diferentes temperaturas para balancear riscos e oportunidades</p>
                          </div>
                        )}
                        {form.watch('strategy') === 'ai' && (
                          <div className="text-sm text-muted-foreground">
                            <div className="flex items-center mb-2">
                              <Brain className="h-4 w-4 mr-2 text-secondary" />
                              <span className="font-medium">Análise estatística multivariável</span>
                            </div>
                            <ul className="space-y-1 ml-6">
                              <li>• Frequência real dos últimos 30 sorteios da Caixa</li>
                              <li>• Pesos iguais: frequência recente + atraso acumulado</li>
                              <li>• Classifica dezenas em quentes, mornos e frias</li>
                              <li>• Valida paridade e sequências antes de incluir</li>
                            </ul>
                          </div>
                        )}
                        {form.watch('strategy') === 'shark' && (
                          <div className="text-sm text-muted-foreground">
                            <div className="flex items-center mb-2">
                              <Brain className="h-4 w-4 mr-2 text-primary" />
                              <span className="font-medium text-primary">Predições com IA</span>
                            </div>
                            <ul className="space-y-1 ml-6">
                              <li>• 🔬 Analisa os 30 últimos sorteios reais da Caixa</li>
                              <li>• 🏆 Gera e valida milhares de combinações</li>
                              <li>• 📊 Pontua cada jogo por frequência + atraso + repetição</li>
                              <li>• ✅ Valida paridade e sequências para cada modalidade</li>
                              <li>• 🧠 Aprende com os resultados anteriores registrados</li>
                            </ul>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Generate Button */}
                <Button
                  type="submit"
                  disabled={isGenerating || !selectedLotteryId}
                  className="w-full border text-white bg-primary/20 hover:bg-primary/30 border-primary/50"
                  data-testid="generate-games-button"
                >
                  {isGenerating ? (
                    <><RefreshCw className="h-5 w-5 mr-2 animate-spin" />GERANDO PREDIÇÕES...</>
                  ) : (
                    <><Brain className="h-5 w-5 mr-2" />GERAR PREDIÇÕES COM IA</>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Painel de Análise — exibido quando há jogos gerados */}
          {generatedGames.length > 0 && (() => {
            const ctx = (generatedGames[0] as any)?.rawGame?.sharkContexto || (generatedGames[0] as any)?.sharkContexto;
            if (!ctx) return null;
            return (
              <Card className="sk-card border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-primary text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Análise dos {ctx.sorteiosAnalisados || 30} Últimos Sorteios — {ctx.estrategia}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-0">
                  {/* Dezenas Quentes */}
                  {ctx.hot?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-400 mb-1.5 flex items-center gap-1">
                        <Flame className="h-3.5 w-3.5" /> Dezenas Quentes — alta freq. recente ({ctx.hot.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {ctx.hot.map((n: number) => (
                          <img key={n} src={`/dezenas/dezena_${n.toString().padStart(2, '0')}.svg`} alt={n.toString().padStart(2,'0')} draggable={false} className="w-8 h-8 [filter:drop-shadow(0_0_6px_rgba(255,60,60,0.9))]" />
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Dezenas Frias */}
                  {ctx.cold?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-blue-400 mb-1.5 flex items-center gap-1">
                        <Snowflake className="h-3.5 w-3.5" /> Dezenas Frias — maior atraso ({ctx.cold.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {ctx.cold.map((n: number) => (
                          <img key={n} src={`/dezenas/dezena_${n.toString().padStart(2, '0')}.svg`} alt={n.toString().padStart(2,'0')} draggable={false} className="w-8 h-8 [filter:drop-shadow(0_0_6px_rgba(0,200,255,0.9))]" />
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Dezenas Mornos */}
                  {ctx.warm?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-yellow-400 mb-1.5 flex items-center gap-1">
                        <Sun className="h-3.5 w-3.5" /> Dezenas Mornos ({ctx.warm.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {ctx.warm.map((n: number) => (
                          <img key={n} src={`/dezenas/dezena_${n.toString().padStart(2, '0')}.svg`} alt={n.toString().padStart(2,'0')} draggable={false} className="w-8 h-8 [filter:drop-shadow(0_0_6px_rgba(255,200,0,0.9))]" />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t border-white/10">
                    <span>📊 {ctx.sorteiosAnalisados || 30} sorteios analisados</span>
                    <span>✅ {ctx.totalValidados?.toLocaleString('pt-BR')} jogos validados</span>
                    {ctx.pesosUsados && (
                      <span>
                        🔥 freq {Math.round((ctx.pesosUsados.frequencia || 0) * 100)}%
                        · ❄️ atraso {Math.round((ctx.pesosUsados.atraso || 0) * 100)}%
                        · 🔄 rep {Math.round((ctx.pesosUsados.repeticao || 0) * 100)}%
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Generated Games */}
          <div className="space-y-3">
            <Card className="sk-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-accent flex items-center">
                  <Dice6 className="h-5 w-5 mr-2" />
                  Jogos Gerados
                </CardTitle>
                {generatedGames.length > 0 && (
                  <div className="flex gap-2">
                  </div>
                )}
              </CardHeader>
            <CardContent className="space-y-3 p-4">
              {generatedGames.length > 0 ? (
                generatedGames.map((game, index) => {
                  const strategyInfo = getStrategyInfo(game.strategy);

                  return (
                    <Card key={index} className="bg-white/[0.04] border-border/50">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-primary">
                              Jogo #{index + 1}
                            </span>
                            <Badge variant="secondary" className={`${strategyInfo.color} text-xs`}>
                              {strategyInfo.emoji} {strategyInfo.name}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(game.numbers)}
                            data-testid={`copy-game-${index}-button`}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-3">
                          {game.numbers.map((number) => (
                            <img
                              key={number}
                              src={`/dezenas/dezena_${number.toString().padStart(2, '0')}.svg`}
                              alt={number.toString().padStart(2, '0')}
                              draggable={false}
                              data-testid={`game-${index}-number-${number}`}
                              className={`w-10 h-10 transition-all ${
                                game.strategy === 'hot' ? '[filter:drop-shadow(0_0_7px_rgba(255,60,60,0.85))]' :
                                game.strategy === 'cold' ? '[filter:drop-shadow(0_0_7px_rgba(0,200,255,0.85))]' :
                                game.strategy === 'shark' ? '[filter:drop-shadow(0_0_7px_rgba(255,200,0,0.85))]' :
                                game.strategy === 'ai' ? '[filter:drop-shadow(0_0_7px_rgba(180,0,255,0.85))]' :
                                '[filter:drop-shadow(0_0_5px_rgba(255,255,255,0.3))]'
                              }`}
                            />
                          ))}
                        </div>

                        {game.strategy === 'shark' ? (
                          <div className="space-y-1 mt-1">
                            <div className="text-xs text-yellow-400/80 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="flex items-center gap-1">
                                <Zap className="h-3 w-3" />
                                Origem: <span className="font-semibold capitalize">{game.sharkOrigem || '—'}</span>
                              </span>
                              {game.sharkScore !== undefined && (
                                <span className="text-muted-foreground">• score {game.sharkScore}</span>
                              )}
                              {game.confidence && (
                                <span className="text-muted-foreground">• confiança {Math.round(game.confidence * 100)}%</span>
                              )}
                            </div>
                            {game.sharkContexto && (
                              <div className="text-xs text-muted-foreground">
                                {game.sharkContexto.totalCandidatos} candidatos → {game.sharkContexto.totalValidados} validados
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            Estratégia: {strategyInfo.description}
                            {game.confidence && ` • Confiança: ${Math.round(game.confidence * 100)}%`}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <div className="text-center text-muted-foreground py-12">
                  <Dice6 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">Nenhum jogo gerado ainda</p>
                  <p className="text-sm">Configure os parâmetros e clique em "Gerar Jogos"</p>
                </div>
              )}
            </CardContent>
            </Card>

            {/* Shark Learning Memory Panel */}
            {sharkRawGames.length > 0 && (
              <Card className="bg-white/[0.06] backdrop-blur-md border border-cyan-500/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-cyan-400 flex items-center text-base">
                      <Brain className="h-5 w-5 mr-2" />
                      Shark Memory &amp; Aprendizado
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-cyan-400 hover:text-cyan-300"
                      onClick={() => setShowMemoriaPanel(v => !v)}
                    >
                      {showMemoriaPanel ? "Ocultar" : "Ver Detalhes"}
                    </Button>
                  </div>
                </CardHeader>
                {showMemoriaPanel && (
                  <CardContent className="space-y-4">
                    {/* Current Weights */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">Pesos Aprendidos</p>
                      <div className="space-y-2">
                        {[
                          { label: "Frequência", value: sharkPesos.frequencia, color: "bg-yellow-400" },
                          { label: "Atraso", value: sharkPesos.atraso, color: "bg-orange-400" },
                          { label: "Repetição", value: sharkPesos.repeticao, color: "bg-cyan-400" },
                        ].map(p => (
                          <div key={p.label} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-24">{p.label}</span>
                            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${p.color}`}
                                style={{ width: `${Math.round(p.value * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-white w-10 text-right">{Math.round(p.value * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    {sharkStats && sharkStats.totalComAcertos > 0 && (
                      <div className="grid grid-cols-1 gap-3">
                        {[
                          { icon: BookOpen, label: "Com resultado", value: sharkStats.totalComAcertos },
                          { icon: Award, label: "Média acertos", value: sharkStats.mediaGeral.toFixed(1) },
                          { icon: TrendingUp, label: "Maior acerto", value: sharkStats.melhorAcerto },
                        ].map(s => (
                          <div key={s.label} className="bg-white/5 rounded-lg p-2 text-center">
                            <s.icon className="h-4 w-4 mx-auto mb-1 text-cyan-400" />
                            <p className="text-lg font-bold text-white">{s.value}</p>
                            <p className="text-xs text-muted-foreground">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Painel de Desempenho por Estratégia */}
                    {Object.keys(relatorio).length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">
                          Desempenho por Estratégia
                        </p>
                        <div className="space-y-1">
                          {Object.entries(relatorio)
                            .sort((a, b) => b[1].media - a[1].media)
                            .map(([estrategia, dados]) => (
                              <div
                                key={estrategia}
                                className="flex items-center justify-between text-xs bg-white/5 rounded px-2 py-1.5"
                              >
                                <span className="text-white/80 capitalize">
                                  {getEmojiEstrategia(estrategia)}{" "}
                                  {estrategia.replace(/_/g, " ")}
                                </span>
                                <span className="text-cyan-300 font-mono tabular-nums">
                                  média {dados.media.toFixed(1)} | 🏆 {dados.melhor} | {dados.jogos}j
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Registrar Resultado */}
                    <div className="border border-white/10 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-white flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        Registrar Resultado Oficial
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Digite as dezenas sorteadas (separadas por vírgula). O Shark calculará os acertos automaticamente.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ex: 5,12,23,34,45,58"
                          value={resultInput}
                          onChange={e => setResultInput(e.target.value)}
                          className="h-8 text-sm bg-white/5 border-white/20 flex-1"
                        />
                        <Button
                          size="sm"
                          className="bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-green-300 text-xs whitespace-nowrap"
                          disabled={!resultInput.trim()}
                          onClick={() => {
                            const dezenas = resultInput.split(/[,\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
                            if (dezenas.length === 0) {
                              toast({ title: "Formato inválido", description: "Digite as dezenas separadas por vírgula.", variant: "destructive" });
                              return;
                            }
                            const lotteryId = form.getValues('lotteryId');
                            const res = registrarResultadoOficial(dezenas, lotteryId);
                            const novosP = ajustarPesos();
                            setSharkPesos(novosP);
                            setSharkStats(estatisticasGerais());
                            setRelatorio(gerarRelatorio());
                            setResultInput("");
                            toast({ title: "Resultado registrado!", description: `${res.registrados} jogo(s) avaliado(s). Melhor: ${res.melhorAcerto} acerto(s). Pesos ajustados!` });
                          }}
                        >
                          Registrar
                        </Button>
                      </div>
                    </div>

                    {/* Reset */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full text-xs"
                      onClick={() => {
                        if (window.confirm("Apagar toda a memória do Shark? Essa ação não pode ser desfeita.")) {
                          resetarMemoria();
                          setSharkPesos({ frequencia: 0.5, atraso: 0.3, repeticao: 0.2 });
                          setSharkStats(estatisticasGerais());
                          toast({ title: "Memória resetada", description: "O Shark voltará aos pesos padrão." });
                        }
                      }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Resetar memória do Shark
                    </Button>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Betting Platform Integration */}
            {generatedGames.length > 0 && selectedLotteryId && (
              <BettingPlatformIntegration
                lotteryId={selectedLotteryId}
                games={generatedGames.map(g => ({ numbers: g.numbers }))}
              />
            )}
          </div>
        </div>

        {/* Quick Actions */}
        {generatedGames.length > 0 && (
          <div className="text-center mt-4">
            <div className="inline-flex gap-3">
              <Button
                onClick={() => setLocation('/heat-map')}
                variant="outline"
                className="border-primary text-primary hover:bg-black/20"
                data-testid="view-heatmap-button"
              >
                <Flame className="h-4 w-4 mr-2" />
                Ver Mapa de Calor
              </Button>

              <Button
                onClick={() => setLocation('/results')}
                data-testid="view-results-button"
              >
                <Target className="h-4 w-4 mr-2" />
                Verificar Resultados
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Developer Footer */}
      <footer className="text-center py-3 mt-4 border-t border-border/20">
        <p className="text-xs text-muted-foreground">
          powered by <span className="text-accent font-semibold">Shark062</span>
        </p>
      </footer>
    </div>
  );
}
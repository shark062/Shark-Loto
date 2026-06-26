import { useState, useEffect } from "react";
import { useMCPAnalysis, type MCPDataResult } from "@/hooks/useMCPAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Search, AlertTriangle, CheckCircle, Flame, Snowflake, BarChart3, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";

const LOTTERIES = [
  { id: "megasena",   name: "Mega-Sena"    },
  { id: "lotofacil",  name: "Lotofácil"    },
  { id: "quina",      name: "Quina"        },
  { id: "lotomania",  name: "Lotomania"    },
  { id: "duplasena",  name: "Dupla Sena"   },
  { id: "timemania",  name: "Timemania"    },
  { id: "diadesorte", name: "Dia de Sorte" },
];

const QUICK_QUERIES = [
  "Quais são os números mais frequentes nos últimos 30 sorteios?",
  "Mostre as estatísticas de soma e paridade dos últimos sorteios",
  "Quais números estão com maior atraso (tempo sem aparecer)?",
  "Faça um resumo completo da frequência histórica dos números",
];

export function MCPAnalyzer() {
  const [query, setQuery] = useState("");
  const [lotteryId, setLotteryId] = useState("megasena");
  const [previewData, setPreviewData] = useState<MCPDataResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { analyze, fetchData, loading, error, result, reset } = useMCPAnalysis();

  useEffect(() => {
    setPreviewData(null);
    setLoadingPreview(true);
    fetchData(lotteryId, 30).then(data => {
      setPreviewData(data);
      setLoadingPreview(false);
    });
  }, [lotteryId]);

  const handleAnalyze = async () => {
    if (!query.trim()) return;
    reset();
    await analyze(query, lotteryId);
  };

  const handleQuickQuery = async (q: string) => {
    setQuery(q);
    reset();
    await analyze(q, lotteryId);
  };

  const tempColor = (t: string) =>
    t === "hot" ? "text-orange-400" : t === "cold" ? "text-blue-400" : "text-yellow-400";

  const tempIcon = (t: string) =>
    t === "hot" ? <Flame className="w-3 h-3" /> : t === "cold" ? <Snowflake className="w-3 h-3" /> : null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 mb-2">
        <Brain className="w-5 h-5 text-cyan-400" />
        <h2 className="text-lg font-bold text-cyan-400">Análise MCP — Dados Reais da Caixa</h2>
        <Badge variant="outline" className="text-xs border-cyan-500/40 text-cyan-400">
          Claude + Tool Use
        </Badge>
      </div>

      {/* Seletor + Query */}
      <Card className="bg-black/40 border-cyan-500/20">
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-3">
            <div className="w-48">
              <Select value={lotteryId} onValueChange={v => { setLotteryId(v); reset(); }}>
                <SelectTrigger className="bg-black/60 border-cyan-500/30 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-cyan-500/30">
                  {LOTTERIES.map(l => (
                    <SelectItem key={l.id} value={l.id} className="text-white hover:bg-cyan-500/10">
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Textarea
              placeholder="Ex: Quais são os números mais frequentes? | Qual a soma média dos sorteios?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-black/60 border-cyan-500/30 text-white placeholder:text-gray-500 resize-none h-10 py-2"
              rows={1}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAnalyze(); } }}
            />

            <Button
              onClick={handleAnalyze}
              disabled={loading || !query.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 shrink-0"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {/* Perguntas rápidas */}
          <div className="flex flex-wrap gap-2">
            {QUICK_QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => handleQuickQuery(q)}
                disabled={loading}
                className="text-xs px-2 py-1 rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 transition-colors disabled:opacity-40"
              >
                {q.length > 50 ? q.slice(0, 48) + "…" : q}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview rápido dos dados reais */}
      {previewData && !result && !loading && (
        <Card className="bg-black/30 border-cyan-500/10">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Prévia — {previewData.lottery_name} ({previewData.draws_analyzed} sorteios reais)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-orange-400 font-semibold mb-1 flex items-center gap-1">
                  <Flame className="w-3 h-3" /> Mais frequentes
                </p>
                <div className="flex flex-wrap gap-1">
                  {previewData.top_frequent.slice(0, 8).map(n => (
                    <span
                      key={n.number}
                      className={`text-xs px-2 py-0.5 rounded-full font-mono bg-orange-500/10 ${tempColor(n.temperature)}`}
                    >
                      {String(n.number).padStart(2, "0")}
                      <span className="text-gray-500 ml-0.5">×{n.frequency}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-blue-400 font-semibold mb-1 flex items-center gap-1">
                  <Snowflake className="w-3 h-3" /> Menos frequentes
                </p>
                <div className="flex flex-wrap gap-1">
                  {previewData.least_frequent.slice(0, 8).map(n => (
                    <span
                      key={n.number}
                      className={`text-xs px-2 py-0.5 rounded-full font-mono bg-blue-500/10 ${tempColor(n.temperature)}`}
                    >
                      {String(n.number).padStart(2, "0")}
                      <span className="text-gray-500 ml-0.5">×{n.frequency}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {previewData.disclaimer}
            </p>
          </CardContent>
        </Card>
      )}

      {loadingPreview && !result && (
        <div className="text-center text-xs text-gray-500 py-2 flex items-center justify-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin" /> Carregando dados reais da Caixa…
        </div>
      )}

      {/* Análise em andamento */}
      {loading && (
        <Card className="bg-black/40 border-cyan-500/20 animate-pulse">
          <CardContent className="py-6 text-center">
            <Brain className="w-8 h-8 text-cyan-400 mx-auto mb-2 animate-bounce" />
            <p className="text-cyan-300 text-sm">Claude analisando dados reais da Caixa…</p>
            <p className="text-gray-500 text-xs mt-1">Buscando sorteios, calculando frequências…</p>
          </CardContent>
        </Card>
      )}

      {/* Erro */}
      {error && !loading && (
        <Card className="bg-red-950/30 border-red-500/30">
          <CardContent className="py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-red-300 text-sm font-medium">Erro na análise</p>
              <p className="text-red-400/70 text-xs mt-0.5">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado da análise */}
      {result?.success && !loading && (
        <Card className="bg-black/40 border-cyan-500/20">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-cyan-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                Análise — {result.lottery_name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs border-green-500/40 text-green-400">
                  {result.metadata?.validation === "ok" ? "✓ Validado" : "⚠ Warning"}
                </Badge>
                <Badge variant="outline" className="text-xs border-gray-500/40 text-gray-400">
                  {result.metadata?.model}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="prose prose-invert prose-sm max-w-none text-gray-200">
              <ReactMarkdown>{result.analysis}</ReactMarkdown>
            </div>
            <div className="mt-3 pt-3 border-t border-cyan-500/10 text-xs text-gray-500 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              Fonte: {result.metadata?.source}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer permanente */}
      <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-200/70">
        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
        <span>
          <strong>Aviso Legal:</strong> Esta análise usa dados históricos reais da Caixa Econômica Federal.
          Loterias são eventos aleatórios — frequências passadas <strong>não predizem</strong> resultados futuros.
          Jogue com responsabilidade.
        </span>
      </div>
    </div>
  );
}

import { apiFetch } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { Brain, CheckCircle, XCircle, TrendingUp, Zap, Shield, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { NeonCard } from "@/components/NeonCard";
import Navigation from "@/components/Navigation";

type AIProviderType =
  | "openai" | "anthropic" | "gemini" | "deepseek"
  | "groq" | "mistral" | "cohere" | "together" | "openrouter" | "custom";

interface ProviderConfig {
  id: string;
  type: AIProviderType;
  name: string;
  model: string;
  enabled: boolean;
  priority: number;
  totalCalls: number;
  successCalls: number;
  successRate: number;
  avgLatencyMs: number;
  lastUsed?: string;
  lastError?: string;
}

interface EvolutionEntry {
  timestamp: string;
  providerName: string;
  action: string;
  latencyMs?: number;
  details?: string;
}

const PROVIDER_LABELS: Record<AIProviderType, { label: string; color: string }> = {
  openai:      { label: "OpenAI",                    color: "text-green-400"  },
  anthropic:   { label: "Anthropic (Claude)",         color: "text-orange-400" },
  gemini:      { label: "Google Gemini",              color: "text-blue-400"   },
  deepseek:    { label: "DeepSeek",                   color: "text-purple-400" },
  groq:        { label: "Groq",                       color: "text-yellow-400" },
  mistral:     { label: "Mistral",                    color: "text-red-400"    },
  cohere:      { label: "Cohere",                     color: "text-pink-400"   },
  together:    { label: "Together AI",                color: "text-cyan-400"   },
  openrouter:  { label: "OpenRouter",                 color: "text-cyan-400"   },
  custom:      { label: "API Custom",                 color: "text-gray-400"   },
};

const ACTION_ICONS: Record<string, string> = {
  call: "📡", success: "✅", error: "❌", promoted: "⬆️", demoted: "⬇️",
};

export default function AIProviders() {
  const [providers, setProviders]       = useState<ProviderConfig[]>([]);
  const [evolutionLog, setEvolutionLog] = useState<EvolutionEntry[]>([]);
  const [stats, setStats]               = useState<any>(null);
  const [showLog, setShowLog]           = useState(false);
  const [loading, setLoading]           = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [provRes, logRes] = await Promise.all([
        apiFetch("/api/ai-providers"),
        apiFetch("/api/ai-providers/evolution?limit=30"),
      ]);
      const provData = await provRes.json();
      const logData  = await logRes.json();
      setProviders(provData.providers || []);
      setStats(provData.stats);
      setEvolutionLog(logData.log || []);
    } catch (e) {
      console.error("Erro ao carregar providers:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const info = (type: AIProviderType) => PROVIDER_LABELS[type] ?? { label: type, color: "text-gray-400" };

  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-6 max-w-4xl">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Brain className="text-cyan-400 w-5 h-5" />
            <h1 className="text-2xl font-bold text-white">Provedores de IA</h1>
          </div>
          <p className="text-sm text-gray-400 mb-3">
            IAs configuradas pelo desenvolvedor — o sistema aprende qual é a melhor automaticamente
          </p>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 font-medium text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: "Providers",  value: stats.total,      icon: Shield,    color: "text-blue-400"   },
              { label: "Ativos",     value: stats.active,     icon: Zap,       color: "text-green-400"  },
              { label: "Melhor IA",  value: stats.best,       icon: TrendingUp, color: "text-yellow-400" },
              { label: "Chamadas",   value: stats.totalCalls, icon: Brain,     color: "text-purple-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <NeonCard key={label} className="p-3 flex flex-col items-center text-center">
                <Icon className={`w-5 h-5 mb-1 ${color}`} />
                <div className="text-lg font-bold text-white">{value ?? "—"}</div>
                <div className="text-xs text-gray-400">{label}</div>
              </NeonCard>
            ))}
          </div>
        )}

        {/* Aviso informativo */}
        <NeonCard className="mb-5 border border-cyan-500/20 bg-cyan-500/5">
          <div className="flex items-start gap-3">
            <span className="text-cyan-400 text-lg mt-0.5">🔐</span>
            <div>
              <p className="text-cyan-300 text-sm font-medium mb-1">Gerenciado pelo desenvolvedor</p>
              <p className="text-gray-400 text-xs leading-relaxed">
                As chaves de API são configuradas diretamente no servidor via variáveis de ambiente.
                O sistema seleciona e rotaciona automaticamente o melhor provedor disponível.
              </p>
            </div>
          </div>
        </NeonCard>

        {/* Lista de Providers */}
        {providers.length === 0 ? (
          <NeonCard className="text-center py-12">
            <Brain className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Nenhum provider configurado.</p>
            <p className="text-gray-500 text-sm mt-1">Configure as variáveis de ambiente no servidor.</p>
          </NeonCard>
        ) : (
          <div className="space-y-3">
            {providers.map((p) => {
              const { label, color } = info(p.type);
              return (
                <NeonCard
                  key={p.id}
                  className={`border ${p.enabled ? "border-white/10" : "border-white/5 opacity-50"}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${p.enabled ? "bg-green-400" : "bg-gray-600"}`} />

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-black/40 ${color}`}>
                          {label}
                        </span>
                        <span className="text-white font-medium text-sm truncate">{p.name}</span>
                        {p.priority === 1 && (
                          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                            ⭐ Principal
                          </span>
                        )}
                        {!p.enabled && (
                          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                            Inativo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mb-1">{p.model}</div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                        <span>🎯 {Math.round(p.successRate * 100)}% sucesso</span>
                        <span>⚡ {Math.round(p.avgLatencyMs)}ms</span>
                        <span>📡 {p.totalCalls} chamadas</span>
                        {p.priority && <span>🏆 #{p.priority}</span>}
                      </div>
                      {p.lastError && (
                        <div className="text-[10px] text-red-400 mt-1 truncate">
                          Último erro: {p.lastError}
                        </div>
                      )}
                    </div>

                    {/* Ícone de status */}
                    <div className="shrink-0">
                      {p.enabled
                        ? <CheckCircle className="w-4 h-4 text-green-400" />
                        : <XCircle className="w-4 h-4 text-red-400" />
                      }
                    </div>
                  </div>
                </NeonCard>
              );
            })}
          </div>
        )}

        {/* Log Evolutivo */}
        {evolutionLog.length > 0 && (
          <div className="mt-6">
            <button
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-3"
              onClick={() => setShowLog(!showLog)}
            >
              <TrendingUp className="w-4 h-4" />
              Log de Atividade ({evolutionLog.length} entradas)
              {showLog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showLog && (
              <NeonCard className="max-h-64 overflow-y-auto">
                <div className="space-y-1">
                  {evolutionLog.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-white/5">
                      <span>{ACTION_ICONS[entry.action] || "•"}</span>
                      <span className="text-gray-500 shrink-0">
                        {new Date(entry.timestamp).toLocaleTimeString("pt-BR")}
                      </span>
                      <span className="text-cyan-400 shrink-0">{entry.providerName}</span>
                      <span className="text-gray-400">{entry.action}</span>
                      {entry.latencyMs && <span className="text-green-400">{entry.latencyMs}ms</span>}
                      {entry.details && <span className="text-gray-500 truncate">{entry.details}</span>}
                    </div>
                  ))}
                </div>
              </NeonCard>
            )}
          </div>
        )}
      </div>
    </>
  );
}

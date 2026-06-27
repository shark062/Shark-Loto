import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Key, Eye, EyeOff, CheckCircle, XCircle,
  RefreshCw, Trash2, LogOut, Lock, Unlock, Activity,
  ChevronDown, ChevronUp, AlertTriangle, Settings
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Provider {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  hasDbKey: boolean;
  hasEnvKey: boolean;
  keySource: "banco" | "env" | "nenhuma";
  successRate: number;
  totalCalls: number;
  avgLatencyMs: number;
  lastError?: string;
  lastUsed?: string;
}

interface TestResult { success: boolean; latencyMs: number; message: string }

const PROVIDER_COLORS: Record<string, string> = {
  openai:     "text-green-400",
  anthropic:  "text-orange-400",
  gemini:     "text-blue-400",
  groq:       "text-yellow-400",
  deepseek:   "text-purple-400",
  openrouter: "text-cyan-400",
  mistral:    "text-red-400",
  cohere:     "text-pink-400",
};

const PROVIDER_ICONS: Record<string, string> = {
  openai: "🤖", anthropic: "🧠", gemini: "💎", groq: "⚡",
  deepseek: "🔬", openrouter: "🔀", mistral: "🌀", cohere: "🌊",
};

const TOKEN_KEY = "loto_admin_token";

function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

// ── Tela de Setup (primeira vez) ───────────────────────────────────────────────

function SetupScreen({ onDone }: { onDone: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSetup = async () => {
    setError("");
    if (password.length < 8) { setError("Mínimo 8 caracteres."); return; }
    if (password !== confirm) { setError("Senhas não coincidem."); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro"); return; }
      onDone(data.token);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/[0.04] border border-primary/30 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-primary">Configuração Inicial</h1>
            <p className="text-muted-foreground text-sm mt-2">
              Defina a senha de acesso ao painel administrativo.<br/>
              Esta senha será armazenada com segurança no banco de dados.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nova senha (mín. 8 caracteres)</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white pr-10 focus:border-primary outline-none"
                  placeholder="••••••••"
                  onKeyDown={e => e.key === "Enter" && handleSetup()}
                />
                <button onClick={() => setShow(s => !s)} className="absolute right-3 top-3.5 text-muted-foreground hover:text-white">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Confirmar senha</label>
              <input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-primary outline-none"
                placeholder="••••••••"
                onKeyDown={e => e.key === "Enter" && handleSetup()}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              onClick={handleSetup}
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/80 text-white"
            >
              {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              {loading ? "Configurando..." : "Criar Senha de Acesso"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tela de Login ──────────────────────────────────────────────────────────────

function LoginScreen({ onDone }: { onDone: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Senha incorreta"); return; }
      onDone(data.token);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/[0.04] border border-primary/30 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-white">Painel Admin</h1>
            <p className="text-muted-foreground text-sm mt-2">Loto-Shark · Acesso restrito</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Senha de administrador</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white pr-10 focus:border-primary outline-none"
                  placeholder="••••••••"
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                />
                <button onClick={() => setShow(s => !s)} className="absolute right-3 top-3.5 text-muted-foreground hover:text-white">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/80 text-white"
            >
              {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card de Provider ───────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  onTest,
  onSaveKey,
  onToggle,
  onRemoveKey,
}: {
  provider: Provider;
  onTest: (id: string) => Promise<TestResult>;
  onSaveKey: (id: string, key: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onRemoveKey: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [editKey, setEditKey]       = useState(false);
  const [keyInput, setKeyInput]     = useState("");
  const [showKey, setShowKey]       = useState(false);
  const [testing, setTesting]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const color = PROVIDER_COLORS[provider.type] || "text-white";
  const icon  = PROVIDER_ICONS[provider.type] || "🔌";

  const hasKey = provider.hasDbKey || provider.hasEnvKey;
  const keyBadge = provider.hasDbKey ? (
    <Badge className="bg-green-500/20 text-green-400 text-xs">Chave no banco</Badge>
  ) : provider.hasEnvKey ? (
    <Badge className="bg-blue-500/20 text-blue-400 text-xs">Chave no env</Badge>
  ) : (
    <Badge className="bg-red-500/20 text-red-400 text-xs">Sem chave</Badge>
  );

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const r = await onTest(provider.id);
    setTestResult(r);
    setTesting(false);
  };

  const handleSave = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    await onSaveKey(provider.id, keyInput.trim());
    setKeyInput("");
    setEditKey(false);
    setSaving(false);
  };

  return (
    <div className={`bg-white/[0.04] border rounded-xl transition-all ${
      provider.enabled ? "border-white/10" : "border-white/5 opacity-60"
    }`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${color}`}>{provider.name}</span>
              {keyBadge}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground capitalize">{provider.type}</span>
              {provider.totalCalls > 0 && (
                <span className="text-xs text-muted-foreground">
                  · {(provider.successRate * 100).toFixed(0)}% sucesso · {provider.totalCalls} chamadas
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasKey && (
            <div className={`w-2 h-2 rounded-full ${provider.enabled ? "bg-green-400" : "bg-gray-600"}`} />
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 p-4 space-y-4">

          {/* Status do teste */}
          {testResult && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
              testResult.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
            }`}>
              {testResult.success
                ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
                : <XCircle className="h-4 w-4 flex-shrink-0" />}
              <span>{testResult.message}</span>
              {testResult.success && (
                <span className="ml-auto text-xs opacity-70">{testResult.latencyMs}ms</span>
              )}
            </div>
          )}

          {/* Último erro */}
          {provider.lastError && !testResult && (
            <div className="flex items-start gap-2 text-sm p-3 rounded-lg bg-yellow-500/10 text-yellow-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span className="text-xs break-all">{provider.lastError}</span>
            </div>
          )}

          {/* Campo de chave */}
          {editKey ? (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Nova chave de API</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  className="w-full bg-black/60 border border-primary/40 rounded-lg px-4 py-2.5 text-white text-sm pr-10 focus:border-primary outline-none font-mono"
                  placeholder="sk-..."
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                />
                <button onClick={() => setShowKey(s => !s)} className="absolute right-3 top-2.5 text-muted-foreground hover:text-white">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving || !keyInput.trim()} className="bg-primary hover:bg-primary/80 text-white">
                  {saving ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Key className="h-3 w-3 mr-1" />}
                  Salvar no Banco
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditKey(false); setKeyInput(""); }} className="border-white/10 text-white hover:bg-white/10">
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => setEditKey(true)}
                className="bg-primary/20 hover:bg-primary/40 text-primary border border-primary/30"
              >
                <Key className="h-3 w-3 mr-1" />
                {hasKey ? "Trocar Chave" : "Adicionar Chave"}
              </Button>

              {hasKey && (
                <Button
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30"
                >
                  {testing
                    ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    : <Activity className="h-3 w-3 mr-1" />}
                  {testing ? "Testando..." : "Testar"}
                </Button>
              )}

              <Button
                size="sm"
                onClick={() => onToggle(provider.id)}
                className={provider.enabled
                  ? "bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30"
                  : "bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30"}
              >
                {provider.enabled
                  ? <><Lock className="h-3 w-3 mr-1" />Desabilitar</>
                  : <><Unlock className="h-3 w-3 mr-1" />Habilitar</>}
              </Button>

              {provider.hasDbKey && (
                <Button
                  size="sm"
                  onClick={() => onRemoveKey(provider.id)}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Remover Chave
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Seção de Troca de Senha ────────────────────────────────────────────────────

function ChangePasswordSection({ onChanged }: { onChanged: (token: string) => void }) {
  const [current, setCurrent]   = useState("");
  const [next, setNext]         = useState("");
  const [confirm, setConfirm]   = useState("");
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleChange = async () => {
    setError(""); setSuccess(false);
    if (next.length < 8) { setError("Mínimo 8 caracteres."); return; }
    if (next !== confirm) { setError("Senhas não coincidem."); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/password", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro"); return; }
      setSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
      onChanged(data.token);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <Settings className="h-4 w-4 text-primary" />
        Alterar Senha de Acesso
      </h3>

      <div className="grid gap-3">
        {[
          { label: "Senha atual", val: current, set: setCurrent },
          { label: "Nova senha", val: next, set: setNext },
          { label: "Confirmar nova senha", val: confirm, set: setConfirm },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={val}
                onChange={e => set(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary outline-none"
                placeholder="••••••••"
                onKeyDown={e => e.key === "Enter" && handleChange()}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => setShow(s => !s)} variant="outline" className="border-white/10 text-muted-foreground hover:text-white hover:bg-white/10">
          {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
        <Button size="sm" onClick={handleChange} disabled={loading} className="bg-primary hover:bg-primary/80 text-white">
          {loading ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : null}
          {loading ? "Alterando..." : "Alterar Senha"}
        </Button>
      </div>

      {error   && <p className="text-red-400 text-xs">{error}</p>}
      {success && <p className="text-green-400 text-xs flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Senha alterada. Token renovado automaticamente.</p>}
    </div>
  );
}

// ── Dashboard principal ────────────────────────────────────────────────────────

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProviders = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await apiFetch("/api/admin/providers", { headers: authHeaders() });
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      setProviders(data.providers || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onLogout]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const handleTest = async (id: string): Promise<TestResult> => {
    const res = await apiFetch(`/api/admin/providers/${id}/test`, {
      method: "POST",
      headers: authHeaders(),
    });
    return res.json();
  };

  const handleSaveKey = async (id: string, apiKey: string) => {
    await apiFetch(`/api/admin/providers/${id}/key`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ apiKey }),
    });
    await fetchProviders(true);
  };

  const handleToggle = async (id: string) => {
    await apiFetch(`/api/admin/providers/${id}/toggle`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    await fetchProviders(true);
  };

  const handleRemoveKey = async (id: string) => {
    if (!confirm("Remover a chave deste provider do banco?")) return;
    await apiFetch(`/api/admin/providers/${id}/key`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    await fetchProviders(true);
  };

  const withKey    = providers.filter(p => p.hasDbKey || p.hasEnvKey).length;
  const active     = providers.filter(p => p.enabled && (p.hasDbKey || p.hasEnvKey)).length;
  const dbStored   = providers.filter(p => p.hasDbKey).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/40 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-white text-sm">Painel Admin · Loto-Shark</h1>
              <p className="text-xs text-muted-foreground">Gerenciamento de provedores de IA</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchProviders(true)}
              disabled={refreshing}
              className="border-white/10 text-muted-foreground hover:text-white hover:bg-white/10"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onLogout}
              className="border-white/10 text-muted-foreground hover:text-white hover:bg-white/10"
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Sair
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Provedores", value: providers.length, color: "text-white" },
            { label: "Com chave", value: withKey, color: "text-primary" },
            { label: "Ativos", value: active, color: "text-green-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Info sobre persistência */}
        {dbStored > 0 && (
          <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-green-300">
              <strong>{dbStored} chave{dbStored > 1 ? "s" : ""} salva{dbStored > 1 ? "s" : ""} no banco Neon</strong> — funcionam em qualquer ambiente,
              sem depender de variáveis de ambiente ou Replit.
            </p>
          </div>
        )}

        {/* Lista de providers */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Provedores de IA
          </h2>
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-white/[0.04] border border-white/5 rounded-xl animate-pulse" />
            ))
          ) : providers.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhum provider encontrado.</p>
          ) : (
            providers.map(p => (
              <ProviderCard
                key={p.id}
                provider={p}
                onTest={handleTest}
                onSaveKey={handleSaveKey}
                onToggle={handleToggle}
                onRemoveKey={handleRemoveKey}
              />
            ))
          )}
        </div>

        {/* Troca de senha */}
        <ChangePasswordSection onChanged={(token) => { setToken(token); }} />

        <p className="text-center text-xs text-muted-foreground pb-8">
          Loto-Shark Admin · Sessão válida por 8h · Dados salvos no banco Neon
        </p>
      </div>
    </div>
  );
}

// ── Componente raiz ────────────────────────────────────────────────────────────

export default function Admin() {
  const [, setLocation]  = useLocation();
  const [screen, setScreen] = useState<"loading" | "setup" | "login" | "dashboard">("loading");

  useEffect(() => {
    (async () => {
      // 1. Verifica se já tem token válido
      const token = getToken();
      if (token) {
        try {
          const res = await apiFetch("/api/admin/providers", { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) { setScreen("dashboard"); return; }
        } catch {}
      }
      clearToken();

      // 2. Verifica se o painel já foi configurado
      try {
        const res = await apiFetch("/api/admin/status");
        const data = await res.json();
        setScreen(data.setup_needed ? "setup" : "login");
      } catch {
        setScreen("login");
      }
    })();
  }, []);

  const handleAuth = (token: string) => {
    setToken(token);
    setScreen("dashboard");
  };

  const handleLogout = () => {
    clearToken();
    setScreen("login");
  };

  if (screen === "loading") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }
  if (screen === "setup")     return <SetupScreen onDone={handleAuth} />;
  if (screen === "login")     return <LoginScreen onDone={handleAuth} />;
  return <AdminDashboard onLogout={handleLogout} />;
}

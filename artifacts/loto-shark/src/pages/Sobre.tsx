import { useState } from "react";
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Copy,
  Check,
  Zap,
  Brain,
  Shield,
  BarChart3,
  RefreshCw,
  Github,
  Star,
  Coffee,
  Smartphone,
  QrCode,
  Info,
  CheckCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PIX_PAYLOAD = "00020101021126580014br.gov.bcb.pix01365d237461-0a79-4ff3-9c8d-40afadf909b15204000053039865802BR5910ALEX SOUSA6007GOIANIA62070503***6304C7B4";
const NOME_BENEFICIARIO = "Alex Sousa";

const FEATURES = [
  { icon: Brain, label: "IA com múltiplos provedores", color: "text-purple-400" },
  { icon: BarChart3, label: "Análise estatística avançada", color: "text-cyan-400" },
  { icon: Zap, label: "Motor Shark de geração", color: "text-yellow-400" },
  { icon: RefreshCw, label: "Dados em tempo real da Caixa", color: "text-green-400" },
  { icon: Shield, label: "Sem cadastro, gratuito", color: "text-blue-400" },
  { icon: Smartphone, label: "100% responsivo", color: "text-pink-400" },
];

const VALORES = [
  { label: "Café ☕", valor: "R$ 5", emoji: "☕" },
  { label: "Apoio 🎯", valor: "R$ 10", emoji: "🎯" },
  { label: "Suporte 🦈", valor: "R$ 20", emoji: "🦈" },
  { label: "Premium 💎", valor: "R$ 50", emoji: "💎" },
];

export default function Sobre() {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopyPix = async () => {
    try {
      await navigator.clipboard.writeText(PIX_PAYLOAD);
      setCopied(true);
      toast({
        title: "PIX copiado! 🎉",
        description: "Cole no seu app de banco e finalize o pagamento. Obrigado pelo apoio!",
      });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({
        title: "Copie manualmente",
        description: PIX_PAYLOAD.slice(0, 60) + "...",
        variant: "destructive",
      });
    }
  };

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(PIX_PAYLOAD)}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <main className="container mx-auto px-4 py-8 max-w-2xl">

        {/* Cabeçalho */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="Loto Shark" className="h-16 w-auto object-contain" />
          </div>
          <h2 className="text-2xl font-bold neon-text text-primary mb-2">
            Sobre o Loto-Shark 🦈
          </h2>
          <p className="text-muted-foreground text-sm">
            Plataforma gratuita de análise de loterias brasileiras com inteligência artificial
          </p>
        </div>

        {/* Sobre o Projeto */}
        <Card className="bg-white/[0.06] backdrop-blur-md border border-white/10 mb-6">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2 text-base">
              <Info className="h-5 w-5" />
              O Projeto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              O <span className="text-primary font-semibold">Loto-Shark</span> é uma plataforma
              independente criada para ajudar apostadores brasileiros a analisar padrões estatísticos
              das loterias da Caixa Econômica Federal.
            </p>
            <p>
              Usamos dados oficiais em tempo real, motor estatístico próprio (Shark Engine) e
              múltiplos modelos de inteligência artificial para gerar jogos inteligentes e análises
              profundas — tudo de graça.
            </p>
            <p className="text-xs">
              ⚠️ <strong className="text-yellow-400">Aviso:</strong> Este projeto é apenas uma ferramenta de análise.
              Jogar na loteria envolve riscos e sorte. Jogue com responsabilidade.
            </p>
          </CardContent>
        </Card>

        {/* Funcionalidades */}
        <Card className="bg-white/[0.06] backdrop-blur-md border border-white/10 mb-6">
          <CardHeader>
            <CardTitle className="text-accent flex items-center gap-2 text-base">
              <Star className="h-5 w-5" />
              O que o Shark oferece
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2">
              {FEATURES.map(({ icon: Icon, label, color }) => (
                <div key={label} className="flex items-center gap-3 p-2 rounded-lg bg-black/20">
                  <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                  <span className="text-sm text-foreground">{label}</span>
                  <CheckCircle className="h-3.5 w-3.5 ml-auto text-green-400 shrink-0" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Seção de Doação PIX */}
        <Card className="mb-6 relative overflow-hidden">
          {/* Brilho de fundo */}
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none" />

          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2 text-base">
              <Heart className="h-5 w-5 text-red-400 fill-red-400" />
              Apoie o Projeto via PIX
            </CardTitle>
          </CardHeader>

          <CardContent className="pb-0 pt-0 px-6 mb-4">
            <div className="p-4 bg-black/30 rounded-xl border border-white/10 text-sm text-muted-foreground space-y-2 leading-relaxed">
              <p className="text-white/80 font-medium text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-cyan-400 shrink-0" />
                Por que estamos pedindo doações?
              </p>
              <p>
                O <span className="text-primary font-semibold">Loto-Shark</span> é um projeto
                independente, desenvolvido e mantido de forma voluntária, sem fins lucrativos
                e sem anúncios. Todos os recursos — servidor, domínio, banco de dados e APIs
                de inteligência artificial — são pagos do próprio bolso do desenvolvedor.
              </p>
              <p>
                A doação via PIX é <span className="text-green-400 font-medium">100% voluntária</span>.
                Não há nenhum produto ou serviço sendo vendido. Ao contribuir, você ajuda
                diretamente a manter o projeto no ar e a financiar novas funcionalidades para
                toda a comunidade.
              </p>
              <p className="text-xs text-white/40 border-t border-white/10 pt-2">
                ✅ Beneficiário identificado: <strong className="text-white/60">Alex Barbosa de Sousa</strong> — Goiânia/GO.
                Se tiver qualquer dúvida, entre em contato antes de realizar qualquer transferência.
              </p>
            </div>
          </CardContent>

          <CardContent className="space-y-5">
            {/* Valores sugeridos */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">Sugestões de valor:</p>
              <div className="grid grid-cols-4 gap-2">
                {VALORES.map(({ label, valor, emoji }) => (
                  <div
                    key={valor}
                    className="flex flex-col items-center p-2 bg-black/30 rounded-xl border border-white/10 hover:border-green-500/40 transition-colors cursor-default"
                  >
                    <span className="text-lg mb-1">{emoji}</span>
                    <span className="text-xs font-bold text-green-400">{valor}</span>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-white rounded-2xl shadow-lg shadow-green-500/20 border-2 border-green-400/30">
                <img
                  src={qrCodeUrl}
                  alt="QR Code PIX"
                  className="w-36 h-36 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <QrCode className="h-3.5 w-3.5 text-green-400" />
                <span>Escaneie com qualquer app de banco</span>
              </div>
            </div>

            {/* Chave PIX */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">Ou copie o código PIX:</p>
              <div className="p-3 bg-black/40 rounded-xl border border-green-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Beneficiário</p>
                    <p className="text-sm font-medium text-green-300">{NOME_BENEFICIARIO}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">PIX</Badge>
                </div>
                <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Copia e Cola</p>
                  <p className="text-[11px] font-mono text-green-400 truncate">{PIX_PAYLOAD.slice(0, 40)}…</p>
                </div>
                <Button
                  onClick={handleCopyPix}
                  size="sm"
                  className={`shrink-0 transition-all ${
                    copied
                      ? "bg-green-600 hover:bg-green-600 text-white"
                      : "bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30"
                  }`}
                  variant="ghost"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copiar
                    </>
                  )}
                </Button>
                </div>
              </div>
            </div>

            {/* Mensagem de agradecimento */}
            <div className="text-center p-3 bg-green-500/5 rounded-xl border border-green-500/10">
              <p className="text-xs text-muted-foreground">
                🦈 Cada doação, por menor que seja, ajuda a pagar o servidor,
                domínio e manter novas funcionalidades chegando.
                <span className="text-green-400 font-medium"> Muito obrigado pelo apoio!</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Versão e créditos */}
        <Card className="bg-white/[0.04] backdrop-blur-md border border-white/10 mb-6">
          <CardContent className="pt-4 pb-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Versão</span>
              <Badge variant="secondary" className="text-[10px]">v2.0 — Shark Engine</Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Dados</span>
              <span className="text-green-400">Caixa Econômica Federal (oficial)</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">IA</span>
              <span className="text-purple-400">OpenAI · Anthropic · Gemini · Groq · +4</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Atualização</span>
              <span className="text-cyan-400">Contínua 🔄</span>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-8 space-y-1">
          <p>Feito com <Heart className="h-3 w-3 inline text-red-400 fill-red-400" /> para a comunidade de apostadores brasileiros</p>
          <p>Loto-Shark não é afiliado à Caixa Econômica Federal</p>
        </div>
      </main>
    </div>
  );
}

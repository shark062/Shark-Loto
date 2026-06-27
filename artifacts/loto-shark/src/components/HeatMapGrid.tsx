import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame } from "lucide-react";
import type { NumberFrequency } from "@/types/lottery";

// Grid oficial de cada modalidade (colunas do volante real da Caixa)
const LOTTERY_COLS: Record<string, number> = {
  lotofacil:  5,   // 1-25  → 5×5
  megasena:   10,  // 1-60  → 10×6
  quina:      10,  // 1-80  → 10×8
  lotomania:  10,  // 0-99  → 10×10
  duplasena:  10,  // 1-50  → 10×5
  timemania:  10,  // 1-80  → 10×8
  diadesorte: 5,   // 1-31  → 5×7 (approx)
  supersete:  5,   // 0-9   → 5×2
};

function getGridCols(lotteryId: string, maxNumbers: number): number {
  if (LOTTERY_COLS[lotteryId]) return LOTTERY_COLS[lotteryId];
  // fallback automático por tamanho
  if (maxNumbers <= 25) return 5;
  if (maxNumbers <= 35) return 7;
  return 10;
}

interface HeatMapGridProps {
  frequencies: NumberFrequency[];
  maxNumbers: number;
  lotteryId?: string;
  isLoading?: boolean;
  onNumberClick?: (number: number) => void;
}

export default function HeatMapGrid({
  frequencies,
  maxNumbers,
  lotteryId = '',
  isLoading,
  onNumberClick
}: HeatMapGridProps) {
  const cols = getGridCols(lotteryId, maxNumbers);

  const getNumberStyle = (number: number) => {
    const freq = frequencies.find(f => f.number === number);
    const temperature = freq?.temperature || 'cold';

    const styles = {
      hot: "bg-red-500/80 text-white border-red-400 hover:bg-red-600/90",
      warm: "bg-yellow-500/80 text-white border-yellow-400 hover:bg-yellow-600/90",
      cold: "bg-blue-500/80 text-white border-blue-400 hover:bg-blue-600/90"
    };

    return styles[temperature];
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-primary flex items-center">
            <Flame className="h-5 w-5 mr-2 text-destructive" />
            Carregando Mapa de Calor...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="number-grid gap-1.5 mb-4 mx-auto"
            style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `${cols * 52}px` }}
          >
            {[...Array(maxNumbers || 25)].map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-white/[0.07] rounded-lg animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="heat-map-grid">
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2">
          <Flame className="h-5 w-5 text-destructive" />
          Mapa de Calor dos Números
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Numbers Grid */}
        <div
          className="number-grid mb-6 mx-auto"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: '6px',
            maxWidth: `${cols * 52}px`,
          }}
        >
          {Array.from({ length: maxNumbers }, (_, i) => {
            const number = i + 1;
            const freq = frequencies.find(f => f.number === number);
            const style = getNumberStyle(number);

            return (
              <button
                key={number}
                onClick={() => onNumberClick?.(number)}
                className={`aspect-square ${style} rounded-full p-0 overflow-hidden shadow-sm hover:scale-105 transition-all duration-200 cursor-pointer`}
                title={`Número ${number} - ${freq?.frequency || 0} vezes - ${freq?.temperature || 'cold'}`}
                data-testid={`number-${number}`}
                data-temperature={freq?.temperature || 'cold'}
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

        {/* Legend */}
        <div className="flex justify-center gap-6 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-red-500/80 border border-red-400 text-[10px]">🔥</span>
            <span className="text-muted-foreground">
              Quentes ({frequencies.filter(f => f.temperature === 'hot').length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-yellow-500/80 border border-yellow-400 text-[10px]">♨️</span>
            <span className="text-muted-foreground">
              Mornos ({frequencies.filter(f => f.temperature === 'warm').length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500/80 border border-blue-400 text-[10px]">❄️</span>
            <span className="text-muted-foreground">
              Frios ({frequencies.filter(f => f.temperature === 'cold').length})
            </span>
          </div>
        </div>

        {/* Statistics */}
        {frequencies.length > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <div className="text-xl font-bold text-red-400">
                {frequencies.filter(f => f.temperature === 'hot').length}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Quentes</div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
              <div className="text-xl font-bold text-amber-400">
                {frequencies.filter(f => f.temperature === 'warm').length}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Mornos</div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <div className="text-xl font-bold text-primary">
                {frequencies.filter(f => f.temperature === 'cold').length}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Frios</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

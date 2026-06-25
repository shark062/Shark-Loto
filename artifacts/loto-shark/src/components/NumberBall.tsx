import { cn } from "@/lib/utils";

interface NumberBallProps {
  number: number;
  className?: string;
  variant?: "default" | "hot" | "cold" | "selected";
  size?: "sm" | "md" | "lg";
}

export function NumberBall({ number, className, variant = "default", size = "md" }: NumberBallProps) {
  const nn = Math.min(number, 99).toString().padStart(2, '0');

  const sizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  const glows: Record<string, string> = {
    default: "",
    hot: "[filter:drop-shadow(0_0_8px_rgba(255,60,60,0.85))]",
    cold: "[filter:drop-shadow(0_0_8px_rgba(0,200,255,0.85))]",
    selected: "[filter:drop-shadow(0_0_12px_rgba(255,0,255,0.95))] animate-pulse",
  };

  return (
    <img
      src={`/dezenas/dezena_${nn}.svg`}
      alt={nn}
      draggable={false}
      className={cn(
        "select-none transition-all duration-300 block",
        sizes[size],
        glows[variant],
        className
      )}
    />
  );
}

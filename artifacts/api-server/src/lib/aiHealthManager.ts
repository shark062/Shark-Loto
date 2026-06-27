import { logger } from "./logger";

// ─── Status de saúde do provider ──────────────────────────────────────────────

export type ProviderStatus = "ONLINE" | "DEGRADED" | "COOLDOWN" | "OFFLINE";

export interface ProviderHealth {
  providerId: string;
  providerName: string;
  status: ProviderStatus;
  failureCount: number;
  successCount: number;
  successRate: number;
  avgLatencyMs: number;
  lastError: string | null;
  lastSuccess: string | null;
  cooldownUntil: number | null;
  consecutiveFailures: number;
}

// ─── In-memory health registry ────────────────────────────────────────────────

const healthRegistry = new Map<string, ProviderHealth>();

// Cooldown durations em ms por tipo de falha
const COOLDOWN_MS = {
  RATE_LIMIT: 30_000,   // 429 temporário: 30s
  SERVER_ERROR: 10_000, // 5xx: 10s
  TIMEOUT: 15_000,      // timeout: 15s
} as const;

// ─── Utilitário de sleep ───────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Classificação de erros HTTP ──────────────────────────────────────────────

export type ErrorClass =
  | "INVALID_CREDENTIAL"  // 401, 403 → OFFLINE permanente
  | "BILLING_EXHAUSTED"   // 402, 429+quota → OFFLINE permanente
  | "RATE_LIMITED"        // 429 temporário → COOLDOWN, retry
  | "SERVER_ERROR"        // 500, 502, 503 → COOLDOWN, retry
  | "TIMEOUT"             // AbortError/timeout → COOLDOWN, retry
  | "TRANSIENT"           // rede, parse etc → retry leve
  | "UNKNOWN";

export interface HttpErrorInfo {
  errorClass: ErrorClass;
  isPermanent: boolean;
  retryAfterMs: number | null;
  message: string;
}

export function classifyHttpError(status: number, body: string): HttpErrorInfo {
  const bodyLower = body.toLowerCase();

  // Credenciais inválidas — permanente
  if (status === 401 || status === 403) {
    return {
      errorClass: "INVALID_CREDENTIAL",
      isPermanent: true,
      retryAfterMs: null,
      message: `HTTP ${status}: credencial inválida ou sem permissão`,
    };
  }

  // Saldo/billing — permanente
  if (status === 402) {
    return {
      errorClass: "BILLING_EXHAUSTED",
      isPermanent: true,
      retryAfterMs: null,
      message: `HTTP ${status}: saldo insuficiente ou billing inativo`,
    };
  }

  // 429 — pode ser temporário ou permanente dependendo do body
  if (status === 429) {
    const isPermanentQuota =
      bodyLower.includes("insufficient_quota") ||
      bodyLower.includes("quota exceeded") ||
      bodyLower.includes("billing") ||
      bodyLower.includes("out of credits") ||
      bodyLower.includes("exceeded your current quota");

    if (isPermanentQuota) {
      return {
        errorClass: "BILLING_EXHAUSTED",
        isPermanent: true,
        retryAfterMs: null,
        message: `HTTP 429: cota esgotada (billing)`,
      };
    }

    // 429 temporário — extrair Retry-After se disponível no body
    const retryMatch = bodyLower.match(/retry.?after[": ]+(\d+)/);
    const retryAfterMs = retryMatch ? parseInt(retryMatch[1]) * 1000 : COOLDOWN_MS.RATE_LIMIT;

    return {
      errorClass: "RATE_LIMITED",
      isPermanent: false,
      retryAfterMs,
      message: `HTTP 429: rate limit temporário`,
    };
  }

  // Erros de servidor — temporários
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return {
      errorClass: "SERVER_ERROR",
      isPermanent: false,
      retryAfterMs: COOLDOWN_MS.SERVER_ERROR,
      message: `HTTP ${status}: erro temporário no servidor da IA`,
    };
  }

  // Outros erros
  return {
    errorClass: "UNKNOWN",
    isPermanent: false,
    retryAfterMs: 5_000,
    message: `HTTP ${status}: erro desconhecido`,
  };
}

export function classifyNetworkError(err: Error): HttpErrorInfo {
  const msg = err.message.toLowerCase();

  if (msg.includes("timeout") || msg.includes("abort") || err.name === "AbortError" || err.name === "TimeoutError") {
    return {
      errorClass: "TIMEOUT",
      isPermanent: false,
      retryAfterMs: COOLDOWN_MS.TIMEOUT,
      message: `Timeout na chamada ao provider`,
    };
  }

  return {
    errorClass: "TRANSIENT",
    isPermanent: false,
    retryAfterMs: 3_000,
    message: `Erro de rede: ${err.message.slice(0, 80)}`,
  };
}

// ─── Inicializar / obter health de um provider ────────────────────────────────

export function getHealth(providerId: string, providerName: string): ProviderHealth {
  if (!healthRegistry.has(providerId)) {
    healthRegistry.set(providerId, {
      providerId,
      providerName,
      status: "ONLINE",
      failureCount: 0,
      successCount: 0,
      successRate: 1.0,
      avgLatencyMs: 0,
      lastError: null,
      lastSuccess: null,
      cooldownUntil: null,
      consecutiveFailures: 0,
    });
  }
  return healthRegistry.get(providerId)!;
}

export function getAllHealth(): ProviderHealth[] {
  return [...healthRegistry.values()];
}

// ─── Registrar sucesso ────────────────────────────────────────────────────────

export function recordSuccess(providerId: string, providerName: string, latencyMs: number): void {
  const h = getHealth(providerId, providerName);
  h.successCount++;
  h.consecutiveFailures = 0;
  h.lastSuccess = new Date().toISOString();
  h.cooldownUntil = null;
  h.avgLatencyMs = h.avgLatencyMs === 0
    ? latencyMs
    : Math.round(h.avgLatencyMs * 0.8 + latencyMs * 0.2);

  const total = h.successCount + h.failureCount;
  h.successRate = total > 0 ? h.successCount / total : 1.0;

  // Restaurar para ONLINE se estava em COOLDOWN/DEGRADED
  if (h.status === "COOLDOWN" || h.status === "DEGRADED") {
    h.status = "ONLINE";
    logger.info({ providerId, providerName, latencyMs }, "Health: provider restaurado para ONLINE");
  }
}

// ─── Registrar falha ──────────────────────────────────────────────────────────

export function recordFailure(
  providerId: string,
  providerName: string,
  errorInfo: HttpErrorInfo,
): void {
  const h = getHealth(providerId, providerName);
  h.failureCount++;
  h.consecutiveFailures++;
  h.lastError = errorInfo.message;

  const total = h.successCount + h.failureCount;
  h.successRate = total > 0 ? h.successCount / total : 0;

  if (errorInfo.isPermanent) {
    h.status = "OFFLINE";
    logger.warn(
      { providerId, providerName, errorClass: errorInfo.errorClass },
      "Health: provider marcado como OFFLINE (erro permanente)",
    );
    return;
  }

  // Erros temporários → COOLDOWN
  if (errorInfo.retryAfterMs) {
    h.cooldownUntil = Date.now() + errorInfo.retryAfterMs;
    h.status = "COOLDOWN";
    logger.info(
      { providerId, providerName, errorClass: errorInfo.errorClass, cooldownMs: errorInfo.retryAfterMs },
      "Health: provider em COOLDOWN temporário",
    );
    return;
  }

  // Muitas falhas consecutivas → DEGRADED
  if (h.consecutiveFailures >= 3) {
    h.status = "DEGRADED";
    logger.warn(
      { providerId, providerName, consecutiveFailures: h.consecutiveFailures },
      "Health: provider marcado como DEGRADED",
    );
  }
}

// ─── Verificar se provider está disponível para uso ───────────────────────────

export function isAvailable(providerId: string, providerName: string): boolean {
  const h = getHealth(providerId, providerName);

  // OFFLINE permanente — nunca disponível
  if (h.status === "OFFLINE") return false;

  // COOLDOWN — verificar se expirou
  if (h.status === "COOLDOWN" && h.cooldownUntil) {
    if (Date.now() >= h.cooldownUntil) {
      h.status = "DEGRADED"; // volta como DEGRADED até sucesso
      h.cooldownUntil = null;
      logger.info({ providerId, providerName }, "Health: cooldown expirado, tentando novamente");
      return true;
    }
    return false;
  }

  return true;
}

// ─── Retry com exponential backoff ────────────────────────────────────────────

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const RETRY_CONFIGS: Record<string, RetryConfig> = {
  RATE_LIMITED: { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 8_000 },
  SERVER_ERROR: { maxAttempts: 2, baseDelayMs: 500,   maxDelayMs: 2_000 },
  TIMEOUT:      { maxAttempts: 2, baseDelayMs: 1_000, maxDelayMs: 3_000 },
  TRANSIENT:    { maxAttempts: 2, baseDelayMs: 500,   maxDelayMs: 2_000 },
  UNKNOWN:      { maxAttempts: 1, baseDelayMs: 1_000, maxDelayMs: 2_000 },
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  providerId: string,
  providerName: string,
  context: string,
): Promise<T> {
  let lastError: Error | null = null;
  let lastErrorInfo: HttpErrorInfo | null = null;

  // Até 3 tentativas para erros temporários
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err: any) {
      lastError = err;

      // Extrair status HTTP do erro se existir
      const statusMatch = err.message?.match(/^HTTP (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;
      const body = err.body || err.message || "";

      let errorInfo: HttpErrorInfo;
      if (status > 0) {
        errorInfo = classifyHttpError(status, body);
      } else {
        errorInfo = classifyNetworkError(err);
      }

      lastErrorInfo = errorInfo;

      logger.warn(
        {
          providerId,
          providerName,
          context,
          attempt,
          errorClass: errorInfo.errorClass,
          isPermanent: errorInfo.isPermanent,
          message: errorInfo.message,
        },
        `Retry: tentativa ${attempt} falhou`,
      );

      // Erros permanentes — não tenta de novo
      if (errorInfo.isPermanent) {
        recordFailure(providerId, providerName, errorInfo);
        throw err;
      }

      // Última tentativa — não espera
      const retryConfig = RETRY_CONFIGS[errorInfo.errorClass] ?? RETRY_CONFIGS.UNKNOWN;
      if (attempt >= retryConfig.maxAttempts) {
        recordFailure(providerId, providerName, errorInfo);
        throw err;
      }

      // Exponential backoff
      const delay = Math.min(
        retryConfig.baseDelayMs * Math.pow(2, attempt - 1),
        retryConfig.maxDelayMs,
      );

      logger.info(
        { providerId, providerName, attempt, delayMs: delay },
        `Retry: aguardando ${delay}ms antes de tentar novamente`,
      );

      await sleep(delay);
    }
  }

  recordFailure(providerId, providerName, lastErrorInfo!);
  throw lastError;
}

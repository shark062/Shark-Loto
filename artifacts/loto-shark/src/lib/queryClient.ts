import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * URL base da API.
 *
 * Resolução em ordem de prioridade:
 *  1. VITE_API_BASE_URL — definida em build time (Render env var, .env, etc.)
 *  2. Detecção automática por hostname — mapeia o domínio do frontend para o
 *     domínio da API correspondente no Render (sem precisar de env var).
 *  3. "" — fallback para desenvolvimento local (usa o proxy Vite /api → :8080)
 */
const HOSTNAME_TO_API: Record<string, string> = {
  "loto-shark-app.onrender.com": "https://loto-shark-api-zcni.onrender.com",
};

function resolveApiBase(): string {
  // 1. Build-time env var (maior prioridade)
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  if (envBase) return envBase.replace(/\/$/, "");

  // 2. Runtime hostname detection (funciona em produção sem env var)
  if (typeof window !== "undefined") {
    const mapped = HOSTNAME_TO_API[window.location.hostname];
    if (mapped) return mapped;
  }

  // 3. Dev local — proxy Vite encaminha /api → localhost:8080
  return "";
}

const API_BASE = resolveApiBase();

/**
 * Resolve um caminho de API relativo para a URL completa.
 */
export function resolveApiUrl(url: string): string {
  if (API_BASE && url.startsWith("/")) {
    return `${API_BASE}${url}`;
  }
  return url;
}

/**
 * Credenciais: omit para API externa (CORS wildcard não aceita credentials).
 */
function credentialsMode(url: string): RequestCredentials {
  return API_BASE && url.startsWith("/") ? "omit" : "include";
}

/**
 * Substituto para fetch() que resolve URLs de API automaticamente.
 */
export function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const resolved = resolveApiUrl(url);
  return fetch(resolved, {
    credentials: credentialsMode(url),
    ...options,
  });
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(resolveApiUrl(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: credentialsMode(url),
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey.join("/") as string;
    const res = await fetch(resolveApiUrl(path), {
      credentials: credentialsMode(path),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

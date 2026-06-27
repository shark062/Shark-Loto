import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * URL base da API externa configurada via VITE_API_BASE_URL.
 * Se não definida, usa a API local (comportamento padrão).
 * Ex.: https://loto-shark-api-zcni.onrender.com
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/**
 * Resolve um caminho de API relativo para a URL completa.
 * Se VITE_API_BASE_URL estiver configurada, prefixa com o servidor externo.
 */
export function resolveApiUrl(url: string): string {
  if (API_BASE && url.startsWith("/")) {
    return `${API_BASE}${url}`;
  }
  return url;
}

/**
 * Retorna as credenciais corretas:
 * - "include" para API local (mesmo domínio / proxy Replit)
 * - "omit"    para API externa (CORS com wildcard não aceita credentials)
 */
function credentialsMode(url: string): RequestCredentials {
  return API_BASE && url.startsWith("/") ? "omit" : "include";
}

/**
 * Substituto para fetch() que resolve URLs de API automaticamente
 * e lida com as credenciais corretas conforme o destino.
 * Use em todos os lugares que chamam fetch('/api/...') diretamente.
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
    // queryKey é um array; join com "/" forma o path completo, ex: "/api/lotteries/megasena/draws"
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

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ============================================================
// RATE LIMITING CONFIGURATION
// ============================================================
// Diferentes limiters para diferentes tipos de rotas
// Usa sliding window algorithm para contagem precisa

// Verifica se Redis está configurado (produção)
const hasRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

// Redis client - só inicializa se tiver as credenciais
const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// ============================================================
// RATE LIMITERS POR TIPO DE ROTA
// ============================================================

/**
 * Rate limiter para rotas de autenticação (login, cadastro)
 * MUITO RESTRITIVO: 5 requisições por minuto
 * Protege contra brute force attacks
 */
export const authLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      prefix: "ratelimit:auth",
      analytics: true,
    })
  : null;

/**
 * Rate limiter para APIs de geração com IA
 * RESTRITIVO: 10 requisições por minuto
 * Protege recursos computacionalmente caros
 */
export const aiLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "ratelimit:ai",
      analytics: true,
    })
  : null;

/**
 * Rate limiter para APIs gerais
 * PADRÃO: 60 requisições por minuto
 * Uso normal da aplicação
 */
export const apiLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "ratelimit:api",
      analytics: true,
    })
  : null;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Determina qual rate limiter usar baseado na rota
 */
export function getRateLimiter(pathname: string): Ratelimit | null {
  // Rotas de autenticação (mais restritivas)
  if (pathname === "/login" || pathname === "/cadastro") {
    return authLimiter;
  }

  // APIs de geração com IA (restritivas)
  if (
    pathname.startsWith("/api/runs") ||
    pathname.startsWith("/api/process-source") ||
    pathname.startsWith("/api/extract-pdf") ||
    pathname.startsWith("/api/extract-document")
  ) {
    return aiLimiter;
  }

  // APIs gerais
  if (pathname.startsWith("/api/")) {
    return apiLimiter;
  }

  // Outras rotas - sem rate limiting
  return null;
}

/**
 * Extrai o IP do request de forma segura.
 * 
 * SEGURANÇA: Prioriza headers confiáveis da plataforma (set pelo edge/proxy)
 * que NÃO podem ser spoofados pelo cliente.
 * 
 * Ordem de confiança:
 * 1. x-vercel-forwarded-for  — Set pelo Vercel Edge, não pode ser spoofado
 * 2. x-forwarded-for         — Fallback para dev local (WARN em produção)
 * 3. 127.0.0.1               — Fallback absoluto
 */
export function getClientIP(request: Request): string {
  // 1. TRUSTED: Vercel platform header (cannot be spoofed by client)
  const vercelIP = request.headers.get("x-vercel-forwarded-for");
  if (vercelIP) {
    return vercelIP.split(",")[0].trim();
  }

  // 2. FALLBACK: x-forwarded-for — only reliable behind a trusted reverse proxy
  //    In production (Vercel), this should never be reached since Vercel always
  //    sets x-vercel-forwarded-for. If we get here in production, log a warning.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[Rate Limiter] WARNING: Falling back to x-forwarded-for header. " +
        "This header is spoofable. Check deployment platform configuration."
      );
    }
    return forwardedFor.split(",")[0].trim();
  }

  // 3. FINAL FALLBACK: localhost (local dev without proxy)
  return "127.0.0.1";
}

/**
 * Verifica se o rate limiting está habilitado
 */
export function isRateLimitingEnabled(): boolean {
  return !!hasRedis;
}

/**
 * Retorna mensagem de erro formatada
 */
export function getRateLimitError(resetTime: number): {
  error: string;
  retryAfter: number;
} {
  const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
  return {
    error: `Muitas requisições. Tente novamente em ${retryAfter} segundos.`,
    retryAfter: Math.max(retryAfter, 1),
  };
}

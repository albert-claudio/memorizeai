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
// WARN if Redis is not configured (especially in production)
// ============================================================
if (!hasRedis) {
  const level = process.env.NODE_ENV === 'production' ? 'ERROR' : 'WARN';
  console.warn(
    `[Rate Limiter] ${level}: Redis not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing). ` +
    `Rate limiting will use in-memory fallback. This is a MITIGATION only — ` +
    `it does NOT protect against distributed attacks or work across multiple instances/pods. ` +
    `Configure Redis for production use.`
  );
}

// ============================================================
// IN-MEMORY FALLBACK RATE LIMITER
// ============================================================
// Used when Redis is not available. NOT distributed — each
// serverless instance/pod has its own counters. This is better
// than nothing but does NOT substitute Redis in production.
// ============================================================

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

// Periodic cleanup to prevent unbounded memory growth
const MEMORY_CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupMemoryStore() {
  const now = Date.now();
  if (now - lastCleanup < MEMORY_CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of memoryStore) {
    if (now > entry.resetAt) {
      memoryStore.delete(key);
    }
  }
}

interface MemoryRateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

function memoryRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): MemoryRateLimitResult {
  cleanupMemoryStore();
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return { success: true, limit: maxRequests, remaining: maxRequests - 1, reset: resetAt };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { success: false, limit: maxRequests, remaining: 0, reset: entry.resetAt };
  }

  return { success: true, limit: maxRequests, remaining: maxRequests - entry.count, reset: entry.resetAt };
}

// ============================================================
// RATE LIMITERS POR TIPO DE ROTA
// ============================================================

// Limits configuration (shared between Redis and memory)
const LIMITS = {
  auth:  { max: 5,  windowMs: 15 * 60_000,  windowLabel: "15 m" },
  ai:    { max: 10, windowMs: 60_000,  windowLabel: "1 m" },
  api:   { max: 60, windowMs: 60_000,  windowLabel: "1 m" },
} as const;

/**
 * Rate limiter para rotas de autenticação (login, cadastro)
 * MUITO RESTRITIVO: 5 requisições por minuto
 * Protege contra brute force attacks
 */
export const authLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMITS.auth.max, LIMITS.auth.windowLabel),
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
      limiter: Ratelimit.slidingWindow(LIMITS.ai.max, LIMITS.ai.windowLabel),
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
      limiter: Ratelimit.slidingWindow(LIMITS.api.max, LIMITS.api.windowLabel),
      prefix: "ratelimit:api",
      analytics: true,
    })
  : null;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

type LimitTier = 'auth' | 'ai' | 'api';

/**
 * Determina qual rate limit tier usar baseado na rota
 */
function getRouteLimitTier(pathname: string): LimitTier | null {
  // Rotas de autenticação (mais restritivas)
  if (pathname === "/login" || pathname === "/cadastro" || pathname === "/api/auth/login") {
    return 'auth';
  }

  // APIs de geração com IA (restritivas)
  if (
    pathname.startsWith("/api/runs") ||
    pathname.startsWith("/api/process-source") ||
    pathname.startsWith("/api/extract-pdf") ||
    pathname.startsWith("/api/extract-document")
  ) {
    return 'ai';
  }

  // APIs gerais
  if (pathname.startsWith("/api/")) {
    return 'api';
  }

  // Outras rotas - sem rate limiting
  return null;
}

/**
 * Determina qual rate limiter usar baseado na rota.
 * Returns the Redis-backed Ratelimit if available, otherwise null.
 * Use applyRateLimit() instead for automatic fallback to in-memory.
 */
export function getRateLimiter(pathname: string): Ratelimit | null {
  const tier = getRouteLimitTier(pathname);
  if (!tier) return null;

  const limiters: Record<LimitTier, Ratelimit | null> = {
    auth: authLimiter,
    ai: aiLimiter,
    api: apiLimiter,
  };

  return limiters[tier];
}

/**
 * Apply rate limiting with automatic fallback to in-memory when Redis
 * is not configured.
 *
 * Returns null if the route doesn't require rate limiting.
 */
export async function applyRateLimit(
  pathname: string,
  identifier: string,
): Promise<{ success: boolean; limit: number; remaining: number; reset: number; mode: 'redis' | 'memory' } | null> {
  const tier = getRouteLimitTier(pathname);
  if (!tier) return null;

  const applyMemoryFallback = () => {
    const config = LIMITS[tier];
    const key = `${tier}:${identifier}`;
    const result = memoryRateLimit(key, config.max, config.windowMs);
    return { ...result, mode: 'memory' as const };
  };

  // Prefer Redis-backed limiter
  const redisLimiter = getRateLimiter(pathname);
  if (redisLimiter) {
    try {
      const result = await redisLimiter.limit(identifier);
      return { ...result, mode: 'redis' as const };
    } catch (error) {
      console.warn(
        '[Rate Limiter] Redis limit failed. Falling back to in-memory rate limiting for this request.',
        error,
      );
      return applyMemoryFallback();
    }
  }

  return applyMemoryFallback();
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
 * Verifica se o rate limiting está habilitado.
 *
 * Returns true if either Redis or in-memory fallback is available.
 * In-memory fallback is always available, so this now always returns true.
 *
 * Use isRedisRateLimitingEnabled() to specifically check for Redis.
 */
export function isRateLimitingEnabled(): boolean {
  return true; // Always enabled: Redis or in-memory fallback
}

/**
 * Verifica se Redis-backed rate limiting está disponível.
 * When false, the system uses in-memory fallback (per-instance, not distributed).
 */
export function isRedisRateLimitingEnabled(): boolean {
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

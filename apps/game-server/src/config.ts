import type { IncomingMessage, ServerResponse } from 'node:http'

export type ServerConfig = {
  port: number
  host: string
  isProduction: boolean
  trustProxy: boolean
  staticDir: string
  corsOrigins: string[]
}

export type HttpServerLike = {
  listeners(event: 'request'): Function[]
  removeAllListeners(event: 'request'): unknown
  on(event: 'request', listener: (req: IncomingMessage, res: ServerResponse) => void): unknown
}

const ALLOWED_HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS'])
const DEFAULT_DEV_CORS_ORIGINS = ['http://localhost:5174', 'http://127.0.0.1:5174']

function parsePort(rawPort: string | undefined): number {
  const trimmed = rawPort?.trim() ?? ''
  if (!trimmed) return 2567
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`PORT inválido: ${trimmed}`)
  }
  const port = Number(trimmed)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT fuera de rango (1-65535): ${trimmed}`)
  }
  return port
}

function parseCorsOrigins(rawOrigins: string | undefined, isProduction: boolean): string[] {
  const trimmed = rawOrigins?.trim() ?? ''
  if (!trimmed) {
    return isProduction ? [] : [...DEFAULT_DEV_CORS_ORIGINS]
  }

  const normalized: string[] = []
  const seen = new Set<string>()
  for (const part of trimmed.split(',')) {
    const entry = part.trim()
    if (!entry || entry === '*') continue
    let parsed: URL
    try {
      parsed = new URL(entry)
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    if (!seen.has(parsed.origin)) {
      seen.add(parsed.origin)
      normalized.push(parsed.origin)
    }
  }
  return normalized
}

export function parseServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === 'production'
  const trustProxyRaw = env.TRUST_PROXY?.trim().toLowerCase() ?? ''
  return {
    port: parsePort(env.PORT),
    host: env.HOST?.trim() || '127.0.0.1',
    isProduction,
    trustProxy: trustProxyRaw === 'true' || trustProxyRaw === '1',
    staticDir: env.STATIC_DIR?.trim() || '',
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS, isProduction),
  }
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  requestHost?: string,
): boolean {
  if (!origin) return false

  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }

  if (allowedOrigins.includes(parsed.origin)) {
    return true
  }

  const normalizedHost = requestHost?.trim().toLowerCase()
  if (normalizedHost && parsed.host.toLowerCase() === normalizedHost) {
    return true
  }

  return false
}

export function resolveCorsHeaders(
  headers: Headers,
  allowedOrigins: readonly string[],
  trustProxy: boolean,
): Record<string, string> {
  const origin = headers.get('origin') ?? undefined
  const forwardedHost = trustProxy
    ? headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    : undefined
  const requestHost = forwardedHost || headers.get('host')?.trim() || undefined

  if (origin && isOriginAllowed(origin, allowedOrigins, requestHost)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    }
  }

  return { Vary: 'Origin' }
}

export function buildSecurityHeaders(
  supabaseUrl: string,
  isProduction: boolean,
): Record<string, string> {
  const supabaseOrigin = new URL(supabaseUrl).origin
  const connectSources = [
    "'self'",
    'wss:',
    supabaseOrigin,
    ...(isProduction ? [] : ['ws://127.0.0.1:*', 'ws://localhost:*']),
  ].join(' ')

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: blob: ${supabaseOrigin}`,
    "media-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connectSources}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': csp,
  }
}

export function extractClientIp(
  req: Pick<IncomingMessage, 'headers' | 'socket'>,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const raw = req.headers['x-forwarded-for']
    const headerValue = Array.isArray(raw) ? raw.join(',') : raw
    if (headerValue) {
      const entries = headerValue
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const rightmost = entries.at(-1)
      if (rightmost) return rightmost
    }
  }

  return req.socket?.remoteAddress || 'unknown'
}

export function createRateLimiter({
  windowMs,
  maxRequests,
  maxEntries = 10000,
}: {
  windowMs: number
  maxRequests: number
  maxEntries?: number
}) {
  const buckets = new Map<string, { count: number; resetAt: number }>()

  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of buckets) {
      if (now >= entry.resetAt) {
        buckets.delete(key)
      }
    }
  }, Math.max(windowMs, 1000))
  cleanup.unref()

  return (key: string, now = Date.now()): boolean => {
    const existing = buckets.get(key)
    if (!existing || now >= existing.resetAt) {
      if (!existing && buckets.size >= maxEntries) {
        for (const [candidateKey, candidate] of buckets) {
          if (now >= candidate.resetAt) {
            buckets.delete(candidateKey)
          }
          if (buckets.size < maxEntries) break
        }
        if (buckets.size >= maxEntries) {
          const oldest = buckets.keys().next().value
          if (oldest !== undefined) buckets.delete(oldest)
        }
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }

    if (existing.count >= maxRequests) {
      return false
    }

    existing.count += 1
    return true
  }
}

export function wrapHttpServer(
  httpServer: HttpServerLike,
  options: {
    securityHeaders: Record<string, string>
    trustProxy: boolean
    matchmakeRateLimiter: (key: string) => boolean
    apiRateLimiter?: (key: string) => boolean
  },
): void {
  const existingListeners = httpServer.listeners('request')
  httpServer.removeAllListeners('request')

  httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
    for (const [key, value] of Object.entries(options.securityHeaders)) {
      res.setHeader(key, value)
    }

    const method = (req.method ?? 'GET').toUpperCase()
    if (!ALLOWED_HTTP_METHODS.has(method)) {
      res.writeHead(405, {
        Allow: 'GET, HEAD, POST, OPTIONS',
        'Cache-Control': 'no-store',
      })
      res.end()
      return
    }

    const pathOnly = (req.url ?? '/').split('?', 1)[0]
    let decodedPath: string
    try {
      decodedPath = decodeURIComponent(pathOnly)
    } catch {
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify({ error: 'Bad request' }))
      return
    }

    if (decodedPath.includes('\0')) {
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify({ error: 'Bad request' }))
      return
    }

    const normalizedPath = decodedPath.replace(/\/{2,}/g, '/')
    if (normalizedPath === '/matchmake' || normalizedPath.startsWith('/matchmake/')) {
      const ip = extractClientIp(req, options.trustProxy)
      if (!options.matchmakeRateLimiter(ip)) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        })
        res.end(JSON.stringify({ error: 'Too many requests' }))
        return
      }
    } else if (
      options.apiRateLimiter &&
      (normalizedPath === '/api' || normalizedPath.startsWith('/api/'))
    ) {
      const ip = extractClientIp(req, options.trustProxy)
      if (!options.apiRateLimiter(ip)) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        })
        res.end(JSON.stringify({ error: 'Too many requests' }))
        return
      }
    }

    for (const listener of existingListeners) {
      listener.call(httpServer, req, res)
    }
  })
}

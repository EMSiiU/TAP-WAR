import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Request, Response } from 'express'
import {
  buildSecurityHeaders,
  createRateLimiter,
  extractClientIp,
  isOriginAllowed,
  parseServerConfig,
  resolveCorsHeaders,
  wrapHttpServer,
} from './config.js'
import { createStaticMiddleware } from './static.js'

test('parseServerConfig usa valores seguros por defecto', () => {
  const cfg = parseServerConfig({})
  assert.equal(cfg.port, 2567)
  assert.equal(cfg.host, '127.0.0.1')
  assert.equal(cfg.isProduction, false)
  assert.equal(cfg.trustProxy, false)
  assert.equal(cfg.staticDir, '')
  assert.deepEqual(cfg.corsOrigins, ['http://localhost:5174', 'http://127.0.0.1:5174'])
})

test('parseServerConfig lee entorno personalizado, elimina * y rechaza PORT invalido', () => {
  const cfg = parseServerConfig({
    NODE_ENV: 'production',
    PORT: '8080',
    HOST: '0.0.0.0',
    TRUST_PROXY: 'true',
    STATIC_DIR: '/app/apps/web/dist',
    CORS_ORIGINS: '*, https://mcserver.tailda19bf.ts.net/, ftp://bad.example, invalid',
  })
  assert.equal(cfg.port, 8080)
  assert.equal(cfg.host, '0.0.0.0')
  assert.equal(cfg.isProduction, true)
  assert.equal(cfg.trustProxy, true)
  assert.equal(cfg.staticDir, '/app/apps/web/dist')
  assert.deepEqual(cfg.corsOrigins, ['https://mcserver.tailda19bf.ts.net'])

  assert.deepEqual(parseServerConfig({ NODE_ENV: 'production', CORS_ORIGINS: '*' }).corsOrigins, [])
  assert.throws(() => parseServerConfig({ PORT: 'abc' }), /PORT/)
  assert.throws(() => parseServerConfig({ PORT: '70000' }), /PORT/)
})

test('isOriginAllowed y resolveCorsHeaders restringen origenes correctamente', () => {
  const allowed = ['https://tap-war-web.onrender.com']
  assert.equal(isOriginAllowed('https://tap-war-web.onrender.com', allowed), true)
  assert.equal(isOriginAllowed('https://mcserver.tailda19bf.ts.net', [], 'mcserver.tailda19bf.ts.net'), true)
  assert.equal(isOriginAllowed('https://evil.example', allowed, 'mcserver.tailda19bf.ts.net'), false)
  assert.equal(isOriginAllowed('javascript:alert(1)', allowed), false)
  assert.equal(isOriginAllowed(undefined, allowed), false)

  const okHeaders = resolveCorsHeaders(
    new Headers({ origin: 'https://tap-war-web.onrender.com' }),
    allowed,
    false,
  )
  assert.equal(okHeaders['Access-Control-Allow-Origin'], 'https://tap-war-web.onrender.com')
  assert.equal(okHeaders['Access-Control-Allow-Credentials'], 'true')

  const sameOriginProxy = resolveCorsHeaders(
    new Headers({
      origin: 'https://mcserver.tailda19bf.ts.net',
      'x-forwarded-host': 'mcserver.tailda19bf.ts.net',
    }),
    [],
    true,
  )
  assert.equal(sameOriginProxy['Access-Control-Allow-Origin'], 'https://mcserver.tailda19bf.ts.net')

  const rejected = resolveCorsHeaders(
    new Headers({ origin: 'https://evil.example', host: 'mcserver.tailda19bf.ts.net' }),
    allowed,
    true,
  )
  assert.deepEqual(rejected, { Vary: 'Origin' })
  assert.equal('Access-Control-Allow-Origin' in rejected, false)
})

test('buildSecurityHeaders incluye cabeceras estrictas y origen de Supabase', () => {
  const prodHeaders = buildSecurityHeaders('https://demo.supabase.co/rest/v1', true)
  assert.equal(prodHeaders['X-Content-Type-Options'], 'nosniff')
  assert.equal(prodHeaders['X-Frame-Options'], 'DENY')
  assert.equal(prodHeaders['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()')
  const csp = prodHeaders['Content-Security-Policy']
  assert.match(csp, /script-src 'self'/)
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/)
  assert.match(csp, /connect-src 'self' wss: https:\/\/demo\.supabase\.co/)
  assert.doesNotMatch(csp, /ws:\/\/127\.0\.0\.1/)

  const devHeaders = buildSecurityHeaders('https://demo.supabase.co', false)
  assert.match(devHeaders['Content-Security-Policy'], /ws:\/\/127\.0\.0\.1:\*/)
})

test('extractClientIp respeta trustProxy sin confiar en encabezados sin proxy', () => {
  const req = {
    headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.10' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Pick<IncomingMessage, 'headers' | 'socket'>
  assert.equal(extractClientIp(req, false), '127.0.0.1')
  assert.equal(extractClientIp(req, true), '198.51.100.10')
})

test('createRateLimiter limita por ventana', () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 2 })
  assert.equal(limiter('10.0.0.1', 100), true)
  assert.equal(limiter('10.0.0.1', 200), true)
  assert.equal(limiter('10.0.0.1', 300), false)
  assert.equal(limiter('10.0.0.2', 300), true)
  assert.equal(limiter('10.0.0.1', 1200), true)
})

test('wrapHttpServer aplica cabeceras, bloquea metodos no permitidos y limita /matchmake', () => {
  const emitter = new EventEmitter()
  let innerCalls = 0
  emitter.on('request', (_req: IncomingMessage, res: ServerResponse) => {
    innerCalls += 1
    res.writeHead(200)
    res.end('ok')
  })

  wrapHttpServer(emitter, {
    securityHeaders: buildSecurityHeaders('https://demo.supabase.co', true),
    trustProxy: false,
    matchmakeRateLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
  })

  function invoke(method: string, url: string) {
    const headers = new Map<string, string>()
    let statusCode = 0
    let body = ''
    const res = {
      setHeader(k: string, v: string) {
        headers.set(k.toLowerCase(), v)
      },
      writeHead(code: number, extra?: Record<string, string>) {
        statusCode = code
        if (extra) {
          for (const [k, v] of Object.entries(extra)) headers.set(k.toLowerCase(), v)
        }
        return this
      },
      end(chunk?: string) {
        if (chunk) body += chunk
      },
    } as unknown as ServerResponse
    const req = { method, url, headers: {}, socket: { remoteAddress: '127.0.0.1' } } as IncomingMessage
    emitter.emit('request', req, res)
    return { statusCode, headers, body }
  }

  const del = invoke('DELETE', '/health')
  assert.equal(del.statusCode, 405)
  assert.equal(del.headers.get('allow'), 'GET, HEAD, POST, OPTIONS')
  assert.equal(del.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(innerCalls, 0)

  const okGet = invoke('GET', '/health')
  assert.equal(okGet.statusCode, 200)
  assert.equal(innerCalls, 1)

  const mm1 = invoke('POST', '/matchmake/joinById/arena-local')
  assert.equal(mm1.statusCode, 200)
  assert.equal(innerCalls, 2)

  const mm2 = invoke('POST', '/matchmake/joinById/arena-local')
  assert.equal(mm2.statusCode, 429)
  assert.equal(innerCalls, 2)
})

test('createStaticMiddleware sirve archivos, SPA fallback, 404 de assets y bloquea traversal', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tapwar-static-'))
  const distDir = path.join(tempRoot, 'dist')
  const assetsDir = path.join(distDir, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(path.join(distDir, 'index.html'), '<html><body>ok</body></html>')
  fs.writeFileSync(path.join(assetsDir, 'index-AbCdEf12.js'), 'console.log(1)')
  fs.writeFileSync(path.join(tempRoot, 'secret.txt'), 'top-secret')

  try {
    const middleware = createStaticMiddleware(distDir)

    async function runRequest(method: string, reqPath: string) {
      let status = 200
      let sentFile = ''
      let nextCalled = false
      const headers = new Map<string, string>()

      await new Promise<void>((resolve) => {
        const res = {
          headersSent: false,
          setHeader(k: string, v: string) {
            headers.set(k.toLowerCase(), v)
          },
          status(code: number) {
            status = code
            return this
          },
          end() {
            resolve()
          },
          sendFile(filePath: string, cb?: (err?: Error) => void) {
            sentFile = filePath
            cb?.()
            resolve()
          },
        } as unknown as Response

        const req = { method, path: reqPath } as Request
        middleware(req, res, () => {
          nextCalled = true
          resolve()
        })
      })

      return { status, sentFile, nextCalled, headers }
    }

    const asset = await runRequest('GET', '/assets/index-AbCdEf12.js')
    assert.equal(asset.sentFile, path.join(assetsDir, 'index-AbCdEf12.js'))
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')

    const callback = await runRequest('GET', '/auth/callback')
    assert.equal(callback.sentFile, path.join(distDir, 'index.html'))
    assert.equal(callback.headers.get('cache-control'), 'no-cache')

    const missingAsset = await runRequest('GET', '/assets/missing.png')
    assert.equal(missingAsset.status, 404)
    assert.equal(missingAsset.sentFile, '')

    const traversal1 = await runRequest('GET', '/../secret.txt')
    assert.equal(traversal1.status, 403)

    const traversal2 = await runRequest('GET', '/%2e%2e/secret.txt')
    assert.equal(traversal2.status, 403)

    const nullByte = await runRequest('GET', '/index.html%00.png')
    assert.equal(nullByte.status, 400)

    const healthSkip = await runRequest('GET', '/health')
    assert.equal(healthSkip.nextCalled, true)

    const matchmakeSkip = await runRequest('GET', '/matchmake/joinById/arena-local')
    assert.equal(matchmakeSkip.nextCalled, true)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

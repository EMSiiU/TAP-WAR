import { initializeResults } from './results.js'
import { defineRoom, defineServer, matchMaker } from 'colyseus'
import { ArenaRoom } from './rooms/ArenaRoom.js'
import { authConfiguration } from './auth.js'
import {
  buildSecurityHeaders,
  createRateLimiter,
  parseServerConfig,
  resolveCorsHeaders,
  wrapHttpServer,
  type HttpServerLike,
} from './config.js'
import { createStaticMiddleware } from './static.js'

const auth = authConfiguration()
const config = parseServerConfig()
await initializeResults()

matchMaker.controller.DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
} as typeof matchMaker.controller.DEFAULT_CORS_HEADERS

matchMaker.controller.getCorsHeaders = (headers) =>
  resolveCorsHeaders(headers, config.corsOrigins, config.trustProxy)

const server = defineServer({
  rooms: {
    arena: defineRoom(ArenaRoom),
  },
  express: (app) => {
    if (config.trustProxy) {
      app.set('trust proxy', 1)
    }
    app.disable('x-powered-by')

    app.get('/health', (_request, response) => {
      response.setHeader('Cache-Control', 'no-store')
      response.json({ ok: true })
    })

    app.get('/api/rooms', async (_request, response) => {
      response.setHeader('Cache-Control', 'no-store')
      try {
        const listings = await matchMaker.query({
          name: 'arena',
          private: false,
          locked: false,
        })
        const rooms = listings
          .filter((room) => {
            const meta = (room.metadata ?? {}) as Record<string, unknown>
            return room.clients < room.maxClients && meta.phase !== 'finished' && meta.gameMode !== 'practice'
          })
          .map((room) => {
            const meta = (room.metadata ?? {}) as Record<string, unknown>
            return {
              code: typeof meta.code === 'string' && meta.code ? meta.code : room.roomId,
              name: typeof meta.name === 'string' && meta.name ? meta.name : `Sala ${room.roomId}`,
              mapSize:
                meta.mapSize === 'medium' || meta.mapSize === 'large' ? meta.mapSize : 'small',
              environment: meta.environment === 'industrial' ? 'industrial' : 'desert',
              gameMode:
                meta.gameMode === 'tdm' || meta.gameMode === 'gungame' ? meta.gameMode : 'ffa',
              clients: room.clients,
              maxClients: room.maxClients,
              phase: meta.phase === 'playing' || meta.phase === 'finished' ? meta.phase : 'waiting',
              hostName: typeof meta.hostName === 'string' ? meta.hostName : '',
            }
          })
        response.json({ rooms })
      } catch {
        response.status(500).json({ error: 'No se pudieron consultar las salas activas.' })
      }
    })

    if (config.staticDir) {
      app.use(createStaticMiddleware(config.staticDir))
    }
  },
})

await server.listen(config.port, config.host)

const httpServer = (server.transport as { server?: HttpServerLike } | undefined)?.server
if (!httpServer) {
  throw new Error('No se encontró el servidor HTTP subyacente para aplicar cabeceras de seguridad.')
}

wrapHttpServer(httpServer, {
  securityHeaders: buildSecurityHeaders(auth.url, config.isProduction),
  trustProxy: config.trustProxy,
  matchmakeRateLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 60 }),
  apiRateLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 120 }),
})

console.log(
  `TAP-WAR game-server escuchando en http://${config.host}:${config.port}${
    config.staticDir ? ' (sirviendo cliente web)' : ''
  }`,
)

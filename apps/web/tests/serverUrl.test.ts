import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveGameServerUrl, toHealthCheckUrl } from '../src/game/serverUrl.ts'

test('dev usa fallback local cuando VITE_GAME_SERVER_URL esta vacio', () => {
  assert.equal(resolveGameServerUrl(undefined, true, 'http://localhost:5174'), 'http://127.0.0.1:2567')
  assert.equal(resolveGameServerUrl('   ', true, 'http://localhost:5174'), 'http://127.0.0.1:2567')
})

test('produccion usa mismo origen cuando VITE_GAME_SERVER_URL esta vacio', () => {
  assert.equal(
    resolveGameServerUrl(undefined, false, 'https://mcserver.tailda19bf.ts.net/'),
    'https://mcserver.tailda19bf.ts.net',
  )
  assert.equal(resolveGameServerUrl('', false, undefined), 'http://127.0.0.1:2567')
})

test('normaliza URLs explicitas y hosts sin protocolo (Render)', () => {
  assert.equal(
    resolveGameServerUrl('https://tap-war-server.onrender.com/', false, 'https://tap-war-web.onrender.com'),
    'https://tap-war-server.onrender.com',
  )
  assert.equal(
    resolveGameServerUrl('tap-war-server.onrender.com/', false, 'https://tap-war-web.onrender.com'),
    'https://tap-war-server.onrender.com',
  )
  assert.equal(resolveGameServerUrl('wss://game.example.com/', false), 'wss://game.example.com')
})

test('toHealthCheckUrl convierte ws/wss y apunta a /health', () => {
  assert.equal(toHealthCheckUrl('http://127.0.0.1:2567'), 'http://127.0.0.1:2567/health')
  assert.equal(
    toHealthCheckUrl('https://mcserver.tailda19bf.ts.net'),
    'https://mcserver.tailda19bf.ts.net/health',
  )
  assert.equal(
    toHealthCheckUrl('wss://tap-war-server.onrender.com'),
    'https://tap-war-server.onrender.com/health',
  )
  assert.equal(toHealthCheckUrl('ws://localhost:2567'), 'http://localhost:2567/health')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyArenaAccount, type AuthConfiguration } from './auth.js'
import type { Client } from 'colyseus'
import { ArenaRoom } from './rooms/ArenaRoom.js'

const config: AuthConfiguration = { url: 'https://example.supabase.co', key: 'sb_publishable_test' }
const userId = '11111111-1111-4111-8111-111111111111'
function token(exp = Math.floor(Date.now() / 1000) + 3600) {
  return `test.${Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url')}.signature`
}

function api(options: { rejectToken?: boolean; anonymous?: boolean; username?: string | null; profileId?: string; failProfile?: boolean } = {}) {
  const requests: { url: string; authorization: string | null }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, authorization: new Headers(init?.headers).get('authorization') })
    if (url.includes('/auth/v1/user')) {
      return options.rejectToken
        ? Response.json({ message: 'invalid JWT', code: 'bad_jwt' }, { status: 401 })
        : Response.json({ id: userId, aud: 'authenticated', role: 'authenticated',
          is_anonymous: options.anonymous ?? false })
    }
    if (url.includes('/rest/v1/profiles')) {
      return options.failProfile
        ? Response.json({ message: 'blocked', code: '42501' }, { status: 403 })
        : Response.json({ id: options.profileId ?? userId,
          username: options.username === undefined ? 'EMSiiU' : options.username })
    }
    throw new Error('Unexpected request')
  }
  return { fetcher, requests }
}

test('sin token se rechaza antes de consultar el proveedor', async () => {
  const mock = api()
  await assert.rejects(verifyArenaAccount(undefined, config, mock.fetcher), /Inicia sesión/)
  assert.equal(mock.requests.length, 0)
})

test('un token rechazado por Auth no obtiene acceso aunque declare una identidad', async () => {
  const mock = api({ rejectToken: true })
  await assert.rejects(verifyArenaAccount(token(), config, mock.fetcher), /sesión no es válida/)
  assert.equal(mock.requests.length, 1)
})

test('el nombre y la cuenta salen del perfil verificado y la consulta usa el JWT propio', async () => {
  const accessToken = token()
  const mock = api()
  const account = await verifyArenaAccount(accessToken, config, mock.fetcher)
  assert.equal(account.accountId, userId)
  assert.equal(account.name, 'EMSiiU')
  assert.ok(account.expiresAt > Date.now())
  assert.equal(mock.requests.length, 2)
  assert.ok(mock.requests[1].url.includes(`id=eq.${userId}`))
  assert.ok(mock.requests.every(request => request.authorization === `Bearer ${accessToken}`))
})

test('token vencido se rechaza incluso si la respuesta simulada de Auth lo acepta', async () => {
  await assert.rejects(verifyArenaAccount(token(1), config, api().fetcher), /sesión venció/)
})

test('cuentas anonimas y perfiles incompletos no entran', async () => {
  await assert.rejects(verifyArenaAccount(token(), config, api({ anonymous: true }).fetcher), /sesión no es válida/)
  for (const username of [null, '', 'ab', 'con espacio', 'ábc', 'abc\n', 'abc\r']) {
    await assert.rejects(verifyArenaAccount(token(), config, api({ username }).fetcher), /username válido/)
  }
})

test('un fallo de RLS o un perfil de otra cuenta no permite entrar', async () => {
  await assert.rejects(verifyArenaAccount(token(), config, api({ failProfile: true }).fetcher), /verificar tu perfil/)
  await assert.rejects(verifyArenaAccount(token(), config, api({ profileId: 'another-account' }).fetcher), /verificar tu perfil/)
})

test('solicitudes concurrentes no comparten tokens ni sesiones', async () => {
  const first = api({ username: 'Jugador_A' })
  const second = api({ username: 'Jugador_B' })
  const tokenA = token(Math.floor(Date.now() / 1000) + 1200)
  const tokenB = token(Math.floor(Date.now() / 1000) + 2400)
  const [a, b] = await Promise.all([
    verifyArenaAccount(tokenA, config, first.fetcher),
    verifyArenaAccount(tokenB, config, second.fetcher),
  ])
  assert.equal(a.name, 'Jugador_A')
  assert.equal(b.name, 'Jugador_B')
  assert.ok(first.requests.every(request => request.authorization === `Bearer ${tokenA}`))
  assert.ok(second.requests.every(request => request.authorization === `Bearer ${tokenB}`))
})

test('la conexion vence con el token y no publica el UUID de cuenta en Player', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  const room = new ArenaRoom()
  const codes: number[] = []
  const client = { sessionId: 'connection-1', leave: (code: number) => { codes.push(code) } } as unknown as Client
  try {
    room.onJoin(client, {}, { accountId: userId, name: 'Jugador', expiresAt: 101000,
      skin: 'fox', teamColor: 'orange', weapon: 'rifle' })
    assert.equal(room.state.players.get(client.sessionId)?.id, 'connection-1')
    assert.ok(!JSON.stringify(room.state.toJSON()).includes(userId))
    context.mock.timers.tick(999)
    assert.deepEqual(codes, [])
    context.mock.timers.tick(1)
    assert.deepEqual(codes, [4001])
  } finally { room.onDispose() }
})

test('salir de la sala cancela el temporizador de la conexion', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  const room = new ArenaRoom()
  const codes: number[] = []
  const client = { sessionId: 'connection-2', leave: (code: number) => { codes.push(code) } } as unknown as Client
  try {
    room.onJoin(client, {}, { accountId: userId, name: 'Jugador', expiresAt: 101000,
      skin: 'fox', teamColor: 'orange', weapon: 'rifle' })
    room.onLeave(client)
    context.mock.timers.tick(1001)
    assert.deepEqual(codes, [])
    assert.equal(room.state.players.size, 0)
  } finally { room.onDispose() }
})

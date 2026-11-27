import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Reflection, StateView } from '@colyseus/schema'
import { ClientState, SchemaSerializer, type Client } from 'colyseus'
import { ArenaRoom } from './rooms/ArenaRoom.js'
import { ArenaState, type WeaponType } from './rooms/ArenaState.js'
import { parseArenaInput } from './rooms/ArenaInput.js'
import { getArenaMap } from './rooms/ArenaMaps.js'
import { segmentBlockedByObstacle } from './rooms/ArenaCollision.js'
import { segmentIntersectsAABB } from '../../../packages/shared/movement.js'
import { ResultStore } from './results.js'

function makeAccount(name: string, weapon: WeaponType = 'rifle') {
  return {
    accountId: randomUUID(),
    name,
    expiresAt: Date.now() + 60_000,
    skin: 'fox' as const,
    teamColor: 'orange' as const,
    weapon,
  }
}

async function createRoomWithSerializer(options: { maxPlayers?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'tap-war-net-'))
  const store = new ResultStore(dir, async () => {})
  await store.initialize()
  const room = new ArenaRoom(store)
  room.lock = async () => {}
  room.unlock = async () => {}
  await room.onCreate(options)

  const serializer = new SchemaSerializer<ArenaState>()
  serializer.reset(room.state)
  const handshake = serializer.handshake()

  const attachClient = (id: string, weapon: WeaponType = 'rifle') => {
    const decoder = Reflection.decode<ArenaState>(handshake)
    const sentMessages: { type: string | number; payload: unknown }[] = []
    let lastRawBytes = 0
    const mockClient = {
      sessionId: id,
      state: ClientState.JOINED,
      view: undefined as StateView | undefined,
      send(type: string | number, payload: unknown) {
        sentMessages.push({ type, payload })
      },
      raw(buf: Uint8Array) {
        lastRawBytes = buf.byteLength
        decoder.decode(buf.subarray(1))
      },
      leave: async () => {},
    } as unknown as Client
    room.onJoin(mockClient, {}, makeAccount(id, weapon))
    decoder.decode(serializer.getFullState(mockClient).subarray(1))
    return {
      client: mockClient,
      decoder,
      sentMessages,
      lastBytes: () => lastRawBytes,
    }
  }

  const cleanup = async () => {
    room.setSimulationInterval(undefined as unknown as () => void)
    clearInterval((room as unknown as { _patchInterval?: ReturnType<typeof setInterval> })._patchInterval)
    room.onDispose()
    store.close()
    await new Promise((r) => setTimeout(r, 15))
    await rm(dir, { recursive: true, force: true })
  }

  return { room, serializer, attachClient, cleanup }
}

test('colision analitica segmento-AABB detecta intersecciones y respeta segmentos libres', () => {
  const small = getArenaMap('small', 'desert')
  const firstInterior = small.obstacles[4]
  assert.ok(firstInterior, 'Debe existir un obstaculo interior en small')

  const cx = firstInterior.x + firstInterior.width / 2
  const cy = firstInterior.y + firstInterior.height / 2

  // Segmento horizontal y vertical atravesando el obstáculo.
  assert.equal(segmentBlockedByObstacle(firstInterior.x - 40, cy, firstInterior.x + firstInterior.width + 40, cy, small), true)
  assert.equal(segmentBlockedByObstacle(cx, firstInterior.y - 40, cx, firstInterior.y + firstInterior.height + 40, small), true)

  // Segmento largo fuera de obstáculos y segmento de longitud 0.
  assert.equal(segmentBlockedByObstacle(100, 100, 140, 100, small), false)
  assert.equal(segmentBlockedByObstacle(cx, cy, cx, cy, small), false)

  // Comprobación directa de segmentIntersectsAABB en diagonales y fuera de rango.
  assert.equal(segmentIntersectsAABB(0, 0, 100, 100, 40, 40, 60, 60), true)
  assert.equal(segmentIntersectsAABB(0, 0, 30, 30, 40, 40, 60, 60), false)
})

test('parseArenaInput valida seq entero uint32 opcional y conserva compatibilidad', () => {
  assert.deepEqual(parseArenaInput({ moveX: 1, moveY: 0, aimAngle: 0 }), {
    moveX: 1,
    moveY: 0,
    aimAngle: 0,
  })
  assert.deepEqual(parseArenaInput({ moveX: 0, moveY: -1, aimAngle: 0.5, seq: 42 }), {
    moveX: 0,
    moveY: -1,
    aimAngle: 0.5,
    seq: 42,
  })
  assert.equal(parseArenaInput({ moveX: 0, moveY: 0, aimAngle: 0, seq: 0xffffffff })?.seq, 0xffffffff)

  for (const badSeq of [-1, 1.5, Number.NaN, '10', null, 0xffffffff + 1]) {
    assert.equal(parseArenaInput({ moveX: 0, moveY: 0, aimAngle: 0, seq: badSeq }), null)
  }
})

test('balas extrapoladas: simX/simY avanzan en servidor sin ensuciar bullet.x/y ni emitir parches en vuelo', async () => {
  const { room, serializer, attachClient, cleanup } = await createRoomWithSerializer({ maxPlayers: 4 })
  try {
    const a = attachClient('a', 'rifle')
    const b = attachClient('b', 'rifle')
    ;(room as unknown as { clients: Client[] }).clients = [a.client, b.client]

    await room['startMatch']()
    const pa = room.state.players.get('a')!
    const pb = room.state.players.get('b')!
    pa.x = 180
    pa.y = 120
    pb.x = 840
    pb.y = 620
    serializer.applyPatches([a.client, b.client])

    room['fireWeapon']('a', pa, 0, performance.now())
    assert.equal(room.state.bullets.size, 1)
    const bullet = [...room.state.bullets.values()][0]
    const initialX = bullet.x
    const initialY = bullet.y
    assert.equal(bullet.simX, initialX)
    assert.equal(bullet.simY, initialY)
    assert.ok(Number.isInteger(bullet.vx) && Number.isInteger(bullet.vy))

    // Parche inicial del disparo: ambos reciben la bala en sala small.
    assert.equal(serializer.applyPatches([a.client, b.client]), true)
    assert.equal(a.decoder.state.bullets.size, 1)

    // Simular varios ticks cortos en vuelo (< 1s para no cambiar segundo de timeRemaining):
    // bullet.simX avanza, pero bullet.x/y permanecen congelados y no generan tráfico de red.
    for (let i = 0; i < 4; i++) {
      room['simulate'](33)
    }
    assert.ok(bullet.simX > initialX + 50, 'La simulación interna debe mover la bala')
    assert.equal(bullet.x, initialX, 'El campo sincronizado x no debe cambiar tras el spawn')
    assert.equal(bullet.y, initialY, 'El campo sincronizado y no debe cambiar tras el spawn')
    assert.equal(
      serializer.applyPatches([a.client, b.client]),
      false,
      'No deben enviarse parches por balas mientras vuelan entre jugadores quietos',
    )
  } finally {
    await cleanup()
  }
})

test('culling espacial y StateView: balas lejanas no se envian y lastInputSeq es privado por cliente', async () => {
  const { room, serializer, attachClient, cleanup } = await createRoomWithSerializer({ maxPlayers: 20 })
  try {
    const west = attachClient('west', 'rifle')
    const mid = attachClient('mid', 'rifle')
    const east = attachClient('east', 'rifle')
    ;(room as unknown as { clients: Client[] }).clients = [west.client, mid.client, east.client]

    await room['startMatch']()
    const pw = room.state.players.get('west')!
    const pm = room.state.players.get('mid')!
    const pe = room.state.players.get('east')!
    pw.x = 200; pw.y = 300
    pm.x = 700; pm.y = 300
    pe.x = 2050; pe.y = 1450
    serializer.applyPatches([west.client, mid.client, east.client])

    // Registrar input con seq para west y avanzar un tick.
    room['inputs'].set('west', { moveX: 1, moveY: 0, aimAngle: 0, seq: 17, receivedAt: performance.now() })
    room['simulate'](33)
    serializer.applyPatches([west.client, mid.client, east.client])

    // Solo west debe recibir su propio lastInputSeq.
    assert.equal(west.decoder.state.players.get('west')?.lastInputSeq, 17)
    assert.equal(mid.decoder.state.players.get('west')?.lastInputSeq, undefined)
    assert.equal(east.decoder.state.players.get('west')?.lastInputSeq, undefined)

    // west dispara al este: west y mid estan cerca de la trayectoria, east (~1850px) no.
    room['fireWeapon']('west', pw, 0, performance.now())
    serializer.applyPatches([west.client, mid.client, east.client])

    assert.equal(room.state.bullets.size, 1)
    assert.equal(west.decoder.state.bullets.size, 1)
    assert.equal(mid.decoder.state.bullets.size, 1)
    assert.equal(east.decoder.state.bullets.size, 0, 'Cliente fuera de rango no recibe balas lejanas')

    // Al borrar la bala en el servidor, west y mid la eliminan sin afectar a east.
    const bulletId = [...room.state.bullets.keys()][0]
    room.state.bullets.delete(bulletId)
    serializer.applyPatches([west.client, mid.client, east.client])
    assert.equal(west.decoder.state.bullets.size, 0)
    assert.equal(mid.decoder.state.bullets.size, 0)
    assert.equal(east.decoder.state.bullets.size, 0)
  } finally {
    await cleanup()
  }
})

test('temporizadores cuantizados: reloj entero por segundo y culling de explosiones en mapa grande', async () => {
  const { room, serializer, attachClient, cleanup } = await createRoomWithSerializer({ maxPlayers: 20 })
  try {
    const near = attachClient('near', 'launcher')
    const far = attachClient('far', 'rifle')
    ;(room as unknown as { clients: Client[] }).clients = [near.client, far.client]

    await room['startMatch']()
    const pn = room.state.players.get('near')!
    const pf = room.state.players.get('far')!
    pn.x = 300; pn.y = 300
    pf.x = 2000; pf.y = 1400
    serializer.applyPatches([near.client, far.client])

    // 10 ticks de 50 ms = 0.5 s: timeRemaining entero debe permanecer en 300 hasta cruzar 1 s.
    for (let i = 0; i < 10; i++) room['simulate'](50)
    assert.equal(room.state.timeRemaining, 300)
    assert.equal(serializer.applyPatches([near.client, far.client]), false)

    // 11 ticks más = 0.55 s adicionales (total 1.05 s): ahora sí debe pasar a 299.
    for (let i = 0; i < 11; i++) room['simulate'](50)
    assert.equal(room.state.timeRemaining, 299)
    assert.equal(serializer.applyPatches([near.client, far.client]), true)

    // Explosión cerca de near: solo near recibe el evento, far no.
    room['detonateExplosion'](320, 320, 128, 75, 'near', 'launcher', performance.now())
    assert.equal(near.sentMessages.filter((m) => m.type === 'explosion').length, 1)
    assert.equal(far.sentMessages.filter((m) => m.type === 'explosion').length, 0)
  } finally {
    await cleanup()
  }
})

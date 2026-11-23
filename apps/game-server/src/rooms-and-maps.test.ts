import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_ACTIVE_ROOMS,
  activeRoomCount,
  allocateRoomCode,
  getArenaMap,
  mapSizeForCapacity,
  normalizeRoomCode,
  releaseRoomCode,
  sanitizeRoomName,
  type MapSize,
} from './rooms/ArenaMaps.js'
import { parseArenaInput } from './rooms/ArenaInput.js'
import { ArenaRoom } from './rooms/ArenaRoom.js'

function pointOverlapsObstacle(
  x: number,
  y: number,
  margin: number,
  obstacles: { x: number; y: number; width: number; height: number }[],
): boolean {
  return obstacles.some((obs) => {
    const cx = Math.max(obs.x, Math.min(x, obs.x + obs.width))
    const cy = Math.max(obs.y, Math.min(y, obs.y + obs.height))
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy < margin * margin
  })
}

test('todos los mapas (small, medium, large) tienen spawns y pickups validos y libres', () => {
  const expected: Record<MapSize, number> = { small: 4, medium: 10, large: 20 }
  for (const size of ['small', 'medium', 'large'] as const) {
    const map = getArenaMap(size)
    assert.equal(map.spawnPoints.length, expected[size])
    assert.equal(map.maxPlayers, expected[size])
    assert.ok(map.pickupSpawnPoints.length >= 2)

    for (const spawn of map.spawnPoints) {
      assert.ok(spawn.x > map.playerRadius && spawn.x < map.width - map.playerRadius)
      assert.ok(spawn.y > map.playerRadius && spawn.y < map.height - map.playerRadius)
      assert.equal(
        pointOverlapsObstacle(spawn.x, spawn.y, map.playerRadius, map.obstacles),
        false,
        `Spawn en (${spawn.x},${spawn.y}) de ${size} colisiona con obstáculo`,
      )
    }

    for (const pickup of map.pickupSpawnPoints) {
      assert.ok(pickup.x > map.playerRadius && pickup.x < map.width - map.playerRadius)
      assert.ok(pickup.y > map.playerRadius && pickup.y < map.height - map.playerRadius)
      assert.equal(
        pointOverlapsObstacle(pickup.x, pickup.y, map.playerRadius, map.obstacles),
        false,
        `Pickup en (${pickup.x},${pickup.y}) de ${size} colisiona con obstáculo`,
      )
    }
  }
})

test('mapSizeForCapacity, sanitizeRoomName y normalizeRoomCode funcionan correctamente', () => {
  assert.deepEqual(mapSizeForCapacity(4), { maxPlayers: 4, mapSize: 'small' })
  assert.deepEqual(mapSizeForCapacity(10), { maxPlayers: 10, mapSize: 'medium' })
  assert.deepEqual(mapSizeForCapacity('20'), { maxPlayers: 20, mapSize: 'large' })
  assert.deepEqual(mapSizeForCapacity(99), { maxPlayers: 4, mapSize: 'small' })

  assert.equal(sanitizeRoomName('  Arena   Pro\u0000 ', 'ABC123'), 'Arena Pro')
  assert.equal(sanitizeRoomName('', 'ABC123'), 'Sala ABC123')
  assert.equal(sanitizeRoomName('x'.repeat(50), 'ABC123').length, 32)

  assert.equal(normalizeRoomCode(' k7 mp2a '), 'K7MP2A')
  assert.equal(normalizeRoomCode('ab!'), '')
})

test('parseArenaInput acepta movimiento analogico continuo en [-1, 1] y rechaza valores invalidos', () => {
  assert.deepEqual(parseArenaInput({ moveX: -0.45, moveY: 0.72, aimAngle: 1.2, shoot: true }), {
    moveX: -0.45,
    moveY: 0.72,
    aimAngle: 1.2,
    shoot: true,
  })
  assert.equal(parseArenaInput({ moveX: 1.01, moveY: 0, aimAngle: 0 }), null)
  assert.equal(parseArenaInput({ moveX: Number.NaN, moveY: 0, aimAngle: 0 }), null)
  assert.equal(parseArenaInput({ moveX: '1', moveY: 0, aimAngle: 0 }), null)
})

test('allocateRoomCode genera codigos unicos y ArenaRoom.onCreate configura sala y limite', async () => {
  const codes = new Set<string>()
  for (let i = 0; i < 10; i++) {
    codes.add(allocateRoomCode())
  }
  assert.equal(codes.size, 10)
  for (const code of codes) releaseRoomCode(code)
  assert.equal(activeRoomCount(), 0)

  const room = new ArenaRoom()
  await room.onCreate({ maxPlayers: 20, isPrivate: true, roomName: 'Torneo' })
  try {
    assert.equal(room.autoDispose, true)
    assert.equal(room.maxClients, 20)
    assert.equal(room.state.mapSize, 'large')
    assert.equal(room.state.maxPlayers, 20)
    assert.equal(room.state.isPrivate, true)
    assert.equal(room.state.roomName, 'Torneo')
    assert.match(room.state.roomCode, /^[A-Z0-9]{6}$/)
  } finally {
    room.setSimulationInterval(undefined as unknown as () => void)
    clearInterval((room as unknown as { _patchInterval?: ReturnType<typeof setInterval> })._patchInterval)
    room.onDispose()
    assert.equal(activeRoomCount(), 0)
  }

  const filled: string[] = []
  try {
    while (activeRoomCount() < MAX_ACTIVE_ROOMS) {
      filled.push(allocateRoomCode())
    }
    const overflow = new ArenaRoom()
    await assert.rejects(overflow.onCreate({ maxPlayers: 4 }), /límite de salas/)
    overflow.setSimulationInterval(undefined as unknown as () => void)
    clearInterval((overflow as unknown as { _patchInterval?: ReturnType<typeof setInterval> })._patchInterval)
    overflow.onDispose()
  } finally {
    for (const code of filled) releaseRoomCode(code)
  }
})

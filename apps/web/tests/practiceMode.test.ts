import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GAME_MODE_OPTIONS,
  gameModeLabel,
  normalizeGameMode,
} from '../src/game/arenaMaps.ts'
import { findAutoAimAngle, findAutoAimTarget } from '../src/game/autoAim.ts'
import { createInitialHudSnapshot, extractArenaHudSnapshot } from '../src/game/hudState.ts'
import type { PlayerState } from '../src/game/ArenaScene.ts'

function makePlayer(overrides: Partial<PlayerState> & { id: string }): PlayerState {
  return {
    x: 128,
    y: 128,
    aimAngle: 0,
    name: overrides.id,
    skin: 'fox',
    teamColor: 'orange',
    weaponType: 'rifle',
    ammo: 15,
    maxAmmo: 15,
    reserveAmmo: 30,
    isReloading: false,
    hp: 100,
    kills: 0,
    deaths: 0,
    isDead: false,
    ...overrides,
  }
}

test('campo de tiro conserva GAME_MODE_OPTIONS competitivo y expone modo practice', () => {
  assert.deepEqual(
    GAME_MODE_OPTIONS.map((mode) => mode.id),
    ['ffa', 'tdm', 'gungame'],
  )
  assert.equal(normalizeGameMode('practice'), 'practice')
  assert.equal(normalizeGameMode('unknown'), 'ffa')
  assert.equal(gameModeLabel('practice'), 'Campo de tiro')

  const initial = createInitialHudSnapshot({
    mode: 'create',
    maxPlayers: 4,
    environment: 'industrial',
    gameMode: 'practice',
    isPrivate: true,
    roomName: 'Campo de tiro',
  })
  assert.equal(initial.matchMeta.gameMode, 'practice')
  assert.equal(initial.matchMeta.environment, 'industrial')
  assert.equal(initial.matchMeta.maxPlayers, 1)
  assert.equal(initial.matchMeta.killsToWin, 0)
  assert.equal(initial.clock, '∞')
})

test('extractArenaHudSnapshot muestra reloj infinito y excluye NPCs del conteo humano', () => {
  const players = new Map<string, PlayerState>([
    ['human-1', makePlayer({ id: 'human-1', name: 'Tester', kills: 4, isBot: false })],
    ['bot-1', makePlayer({ id: 'bot-1', name: 'Blanco Fijo', x: 352, isBot: true, teamColor: 'blue' })],
    ['bot-2', makePlayer({ id: 'bot-2', name: 'Blanco Lejano', x: 896, isBot: true, teamColor: 'blue' })],
    ['bot-3', makePlayer({ id: 'bot-3', name: 'Blanco Móvil', x: 640, y: 640, isBot: true })],
    ['bot-4', makePlayer({ id: 'bot-4', name: 'Blanco Patrulla', x: 352, y: 304, isBot: true })],
  ])

  const hud = extractArenaHudSnapshot(
    {
      roomCode: 'PRACT1',
      roomName: 'Campo de tiro',
      mapSize: 'small',
      environment: 'desert',
      gameMode: 'practice',
      maxPlayers: 1,
      isPrivate: true,
      phase: 'playing',
      timeRemaining: 0,
      killsToWin: 0,
      players,
    },
    'human-1',
  )

  assert.equal(hud.clock, '∞')
  assert.equal(hud.playerCount, 1)
  assert.equal(hud.matchMeta.maxPlayers, 1)
  assert.equal(hud.matchMeta.killsToWin, 0)
  assert.equal(hud.scoreLine, 'Bajas práctica: 4 · 4 NPCs')
})

test('autoapuntado fija objetivos NPC vivos en modo practice e ignora NPCs caídos', () => {
  const local = makePlayer({ id: 'human-1', x: 128, y: 128, teamColor: 'orange' })
  const deadClose = makePlayer({
    id: 'bot-dead',
    x: 200,
    y: 128,
    isDead: true,
    isBot: true,
    teamColor: 'blue',
  })
  const aliveSameColor = makePlayer({
    id: 'bot-alive',
    x: 328,
    y: 128,
    isDead: false,
    isBot: true,
    teamColor: 'orange',
  })

  const target = findAutoAimTarget(local, [local, deadClose, aliveSameColor], 'practice', 520)
  assert.equal(target?.id, 'bot-alive')

  const aim = findAutoAimAngle(local, [local, deadClose, aliveSameColor], 'practice', 1.2, 0)
  assert.equal(aim.target?.id, 'bot-alive')
  assert.ok(Math.abs(aim.angle) < 1e-6)
})

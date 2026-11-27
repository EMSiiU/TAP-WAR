import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAYER_MOVE_SPEED,
  isBulletTrajectoryRelevantToViewer,
  segmentIntersectsAABB,
  stepPlayerMovement,
} from '../../../packages/shared/movement.ts'
import { getArenaMap, segmentBlockedByObstacle } from '../src/game/arenaMaps.ts'
import { LocalPlayerPredictor } from '../src/game/prediction.ts'
import {
  areHudSnapshotsEqual,
  createInitialHudSnapshot,
  extractArenaHudSnapshot,
  type HudSourceState,
} from '../src/game/hudState.ts'
import type { PlayerState } from '../src/game/ArenaScene.ts'

test('LocalPlayerPredictor predice movimiento inmediato y respeta colisiones de obstáculos', () => {
  const small = getArenaMap('small', 'desert')
  const predictor = new LocalPlayerPredictor(small)
  predictor.reset(200, 200)

  const pos = predictor.stepFrame(1, 0, 0.05, 1, true)
  assert.ok(Math.abs(pos.x - (200 + PLAYER_MOVE_SPEED * 0.05)) < 1e-6)
  assert.equal(pos.y, 200)
  assert.equal(predictor.getPendingCount(), 1)

  // Empujar repetidamente contra el obstáculo interior: nunca debe invadirlo.
  const obs = small.obstacles[4]
  predictor.reset(obs.x - small.playerRadius - 2, obs.y + obs.height / 2)
  for (let i = 0; i < 30; i++) {
    predictor.stepFrame(1, 0, 0.016, i + 1, true)
  }
  const clamped = predictor.getVisualPosition()
  assert.ok(clamped.x <= obs.x - small.playerRadius + 0.01)
})

test('LocalPlayerPredictor reconcilia entradas confirmadas, suaviza errores y hace snap en teletransporte', () => {
  const small = getArenaMap('small', 'desert')
  const predictor = new LocalPlayerPredictor(small)
  predictor.reset(120, 400)

  // 3 frames con seq=1 y 3 frames con seq=2 (dt = 0.02 cada uno).
  for (let i = 0; i < 3; i++) predictor.stepFrame(1, 0, 0.02, 1, true)
  for (let i = 0; i < 3; i++) predictor.stepFrame(1, 0, 0.02, 2, true)
  const expectedTotal = 120 + PLAYER_MOVE_SPEED * 0.12
  assert.ok(Math.abs(predictor.getVisualPosition().x - expectedTotal) < 1e-6)

  // Servidor confirma seq=1 exactamente en la posición simulada tras 3 pasos:
  const serverAtSeq1 = stepPlayerMovement({ x: 120, y: 400 }, 1, 0, 0.06, small, PLAYER_MOVE_SPEED)
  const reconciled = predictor.reconcile(serverAtSeq1.x, serverAtSeq1.y, 1)
  assert.equal(predictor.getPendingCount(), 3)
  assert.ok(Math.abs(reconciled.x - expectedTotal) < 1e-4)

  // Discrepancia pequeña de 30 px: conserva suavidad visual en el primer frame y decae hacia el objetivo.
  const afterMismatch = predictor.reconcile(serverAtSeq1.x - 30, serverAtSeq1.y, 1)
  assert.ok(afterMismatch.x > expectedTotal - 5, 'No debe dar salto brusco ante error pequeño')
  const decayed = predictor.stepFrame(0, 0, 0.1, 2, false)
  assert.ok(decayed.x < afterMismatch.x, 'El offset de error debe decaer hacia la posición autoritativa')

  // Teletransporte / respawn lejano (> 140 px): snap duro inmediato.
  const teleported = predictor.reconcile(800, 600, 2)
  assert.equal(teleported.x, 800)
  assert.equal(teleported.y, 600)
  assert.equal(predictor.getPendingCount(), 0)
})

test('extractArenaHudSnapshot y areHudSnapshotsEqual evitan re-renders de React en actualizaciones de posición y balas', () => {
  const initial = createInitialHudSnapshot({
    mode: 'create',
    maxPlayers: 10,
    environment: 'desert',
    gameMode: 'ffa',
    isPrivate: false,
    roomName: 'Clase',
  })
  assert.equal(initial.matchMeta.mapSize, 'medium')

  const makePlayer = (id: string, x: number, kills: number, ammo: number): PlayerState => ({
    id,
    x,
    y: 200,
    aimAngle: 0,
    name: id,
    skin: 'fox',
    teamColor: 'orange',
    weaponType: 'rifle',
    ammo,
    maxAmmo: 15,
    reserveAmmo: 15,
    isReloading: false,
    reloadProgress: 0,
    hp: 100,
    shield: 0,
    shieldRemaining: 0,
    goldenRemaining: 0,
    dashes: 5,
    maxDashes: 5,
    dashRechargeProgress: 0,
    kills,
    deaths: 0,
    isDead: false,
    emote: '',
    lastInputSeq: 10,
  })

  const stateA: HudSourceState = {
    roomCode: 'ABC123',
    roomName: 'Clase',
    mapSize: 'medium',
    environment: 'desert',
    gameMode: 'ffa',
    maxPlayers: 10,
    phase: 'playing',
    timeRemaining: 299.8,
    killsToWin: 20,
    players: new Map([
      ['p1', makePlayer('p1', 150, 2, 12)],
      ['p2', makePlayer('p2', 400, 1, 10)],
    ]),
  }

  const snapA = extractArenaHudSnapshot(stateA, 'p1')

  // Cambiar x/y/aimAngle/lastInputSeq/hp y décimas dentro del mismo segundo entero: HUD idéntico.
  const p1Moved = { ...makePlayer('p1', 390, 2, 12), aimAngle: 1.4, hp: 55, lastInputSeq: 99 }
  const p2Moved = { ...makePlayer('p2', 820, 1, 4), isDead: true }
  const stateSameHud: HudSourceState = {
    ...stateA,
    timeRemaining: 299.1,
    players: new Map([
      ['p1', p1Moved],
      ['p2', p2Moved],
    ]),
  }
  const snapSameHud = extractArenaHudSnapshot(stateSameHud, 'p1')
  assert.equal(areHudSnapshotsEqual(snapA, snapSameHud), true)

  // Cambiar segundo entero de reloj, munición o kills: sí debe marcar cambio de HUD.
  const snapTick = extractArenaHudSnapshot({ ...stateSameHud, timeRemaining: 298.9 }, 'p1')
  assert.equal(areHudSnapshotsEqual(snapA, snapTick), false)

  const snapAmmo = extractArenaHudSnapshot(
    {
      ...stateA,
      players: new Map([
        ['p1', makePlayer('p1', 150, 2, 11)],
        ['p2', makePlayer('p2', 400, 1, 10)],
      ]),
    },
    'p1',
  )
  assert.equal(areHudSnapshotsEqual(snapA, snapAmmo), false)
})

test('trayectoria relevante al visor y colision analitica en cliente funcionan con exactitud', () => {
  // Dentro o cruzando viewport del observador
  assert.equal(isBulletTrajectoryRelevantToViewer(300, 300, 600, 0, 2, 1200, 300, 860, 720), true)
  // Bala muy lejos y sin cruzar la ventana del observador
  assert.equal(isBulletTrajectoryRelevantToViewer(100, 100, 0, 600, 2, 1800, 1400, 860, 720), false)

  const small = getArenaMap('small', 'industrial')
  const wall = small.obstacles[4]
  assert.equal(segmentIntersectsAABB(wall.x - 10, wall.y - 10, wall.x - 1, wall.y - 1, wall.x, wall.y, wall.x + wall.width, wall.y + wall.height), false)
  assert.equal(segmentBlockedByObstacle(wall.x - 20, wall.y + wall.height / 2, wall.x + wall.width + 20, wall.y + wall.height / 2, small), true)
})

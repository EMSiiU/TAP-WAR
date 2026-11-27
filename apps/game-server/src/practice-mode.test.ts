import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from 'colyseus'
import weaponsConfig from '../../../packages/shared/weapons.json' with { type: 'json' }
import { MAX_DASHES, SHIELD_DURATION_MS } from '../../../packages/shared/gameplay.js'
import {
  overlapsObstacleWithRadius,
  segmentBlockedByObstacle,
} from '../../../packages/shared/movement.js'
import { ResultStore } from './results.js'
import { ArenaRoom } from './rooms/ArenaRoom.js'
import { getArenaMap } from './rooms/ArenaMaps.js'
import {
  PRACTICE_BOT_IDLE_HEAL_MS,
  PRACTICE_BOT_RESPAWN_MS,
  PRACTICE_DUMMY_SPECS,
  PRACTICE_PLAYER_SPAWN,
  PRACTICE_POWERUP_RESPAWN_MS,
  PRACTICE_POWERUP_STATIONS,
  PRACTICE_SAMPLE_PICKUPS,
  parsePracticeAction,
} from './rooms/PracticeMode.js'

function disposeTestRoom(room: ArenaRoom) {
  room.setSimulationInterval(undefined as unknown as () => void)
  clearInterval(
    (room as unknown as { _patchInterval?: ReturnType<typeof setInterval> })._patchInterval,
  )
  room.onDispose()
}

function makeAccount(name = 'Tester') {
  return {
    accountId: randomUUID(),
    name,
    expiresAt: Date.now() + 60_000,
    skin: 'fox' as const,
    teamColor: 'orange' as const,
    weapon: 'rifle' as const,
  }
}

test('parsePracticeAction valida estrictamente acciones y armas permitidas', () => {
  assert.deepEqual(parsePracticeAction({ action: 'equip_weapon', weapon: 'sniper' }, weaponsConfig.weapons), {
    action: 'equip_weapon',
    weapon: 'sniper',
  })
  assert.deepEqual(parsePracticeAction({ action: 'refill' }, weaponsConfig.weapons), { action: 'refill' })
  assert.deepEqual(parsePracticeAction({ action: 'self_damage' }, weaponsConfig.weapons), {
    action: 'self_damage',
  })
  assert.deepEqual(parsePracticeAction({ action: 'reset_dummies' }, weaponsConfig.weapons), {
    action: 'reset_dummies',
  })
  assert.deepEqual(parsePracticeAction({ action: 'toggle_dummy_shield' }, weaponsConfig.weapons), {
    action: 'toggle_dummy_shield',
  })

  assert.equal(parsePracticeAction(null, weaponsConfig.weapons), null)
  assert.equal(parsePracticeAction(['refill'], weaponsConfig.weapons), null)
  assert.equal(parsePracticeAction({ action: 'equip_weapon', weapon: 'bfg9000' }, weaponsConfig.weapons), null)
  assert.equal(parsePracticeAction({ action: 'equip_weapon', weapon: '__proto__' }, weaponsConfig.weapons), null)
  assert.equal(parsePracticeAction({ action: 'win_match' }, weaponsConfig.weapons), null)
})

test('posiciones y rutas del campo de tiro están libres de obstáculos en desert e industrial', () => {
  for (const env of ['desert', 'industrial'] as const) {
    const map = getArenaMap('small', env)
    assert.equal(
      overlapsObstacleWithRadius(PRACTICE_PLAYER_SPAWN.x, PRACTICE_PLAYER_SPAWN.y, 24, map),
      false,
      `Spawn del jugador bloqueado en ${env}`,
    )

    for (const spec of PRACTICE_DUMMY_SPECS) {
      assert.equal(
        overlapsObstacleWithRadius(spec.homeX, spec.homeY, 24, map),
        false,
        `NPC ${spec.id} bloqueado en ${env}`,
      )
      if (spec.patrol) {
        assert.equal(
          overlapsObstacleWithRadius(spec.patrol.endX, spec.patrol.endY, 24, map),
          false,
          `Destino de patrulla de ${spec.id} bloqueado en ${env}`,
        )
        assert.equal(
          segmentBlockedByObstacle(spec.homeX, spec.homeY, spec.patrol.endX, spec.patrol.endY, map),
          false,
          `Ruta de patrulla de ${spec.id} intersecta obstáculo en ${env}`,
        )
      }
    }

    for (const pad of PRACTICE_POWERUP_STATIONS) {
      assert.equal(
        overlapsObstacleWithRadius(pad.x, pad.y, 24, map),
        false,
        `Estación ${pad.id} bloqueada en ${env}`,
      )
    }

    for (const pickup of PRACTICE_SAMPLE_PICKUPS) {
      assert.equal(
        overlapsObstacleWithRadius(pickup.x, pickup.y, 24, map),
        false,
        `Pickup ${pickup.weaponType} bloqueado en ${env}`,
      )
    }
  }
})

test('ArenaRoom en modo practice fuerza sala privada de 1 plaza, 4 NPCs, daño sin ResultStore y reaparición', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tap-war-practice-'))
  let beginCalls = 0
  let finishCalls = 0
  const store = new ResultStore(directory, async () => {
    finishCalls += 1
  })
  const origBegin = store.begin.bind(store)
  store.begin = async (...args) => {
    beginCalls += 1
    return origBegin(...args)
  }

  const room = new ArenaRoom(store)
  room.lock = async () => {}
  room.unlock = async () => {}

  const sentMessages: { type: string; payload: unknown }[] = []
  const client = {
    sessionId: 'player-1',
    send(type: string, payload: unknown) {
      sentMessages.push({ type, payload })
    },
  } as unknown as Client

  try {
    await store.initialize()
    await room.onCreate({
      gameMode: 'practice',
      environment: 'industrial',
      maxPlayers: 20,
      isPrivate: false,
      roomName: 'Nombre ignorado',
    })

    assert.equal(room.maxClients, 1)
    assert.equal(room.state.gameMode, 'practice')
    assert.equal(room.state.mapSize, 'small')
    assert.equal(room.state.environment, 'industrial')
    assert.equal(room.state.isPrivate, true)
    assert.equal(room.state.roomName, 'Campo de tiro')
    assert.equal(room.state.killsToWin, 0)
    assert.equal(room.state.timeRemaining, 0)

    room.onJoin(client, {}, makeAccount('Tirador'))

    assert.equal(room.state.phase, 'playing')
    assert.equal(beginCalls, 0)
    assert.equal(finishCalls, 0)
    assert.equal(room.state.players.size, 1 + PRACTICE_DUMMY_SPECS.length)
    assert.equal(room.state.powerUps.size, PRACTICE_POWERUP_STATIONS.length)
    assert.equal(room.state.pickups.size, PRACTICE_SAMPLE_PICKUPS.length)

    const human = room.state.players.get('player-1')!
    assert.equal(human.isBot, false)
    assert.equal(human.x, PRACTICE_PLAYER_SPAWN.x)
    assert.equal(human.y, PRACTICE_PLAYER_SPAWN.y)

    // No admite un segundo jugador humano (aunque haya 4 NPCs en el estado).
    assert.throws(
      () => room.onJoin({ sessionId: 'intruder' } as Client, {}, makeAccount('Otro')),
      /llena/,
    )

    const closeBot = room.state.players.get('bot-static-close')!
    assert.equal(closeBot.isBot, true)

    // Daño directo emite damage_feedback al atacante y reduce HP sin finalizar la partida.
    const t0 = performance.now()
    room['applyDamageToPlayer']('bot-static-close', closeBot, 'player-1', 45, t0, 'rifle')
    assert.equal(closeBot.hp, 55)
    assert.deepEqual(sentMessages.at(-1), {
      type: 'damage_feedback',
      payload: {
        x: Math.round(closeBot.x),
        y: Math.round(closeBot.y),
        damage: 45,
        blocked: false,
        weaponType: 'rifle',
      },
    })

    // Curación automática tras idle prolongado sin recibir daño.
    room['updatePracticeBots'](0.05, t0 + PRACTICE_BOT_IDLE_HEAL_MS + 10)
    assert.equal(closeBot.hp, 100)

    // Escudo en blanco cercano bloquea el daño y emite blocked: true.
    room['handlePracticeAction'](client, { action: 'toggle_dummy_shield' })
    assert.ok(closeBot.shield > 0)
    room['applyDamageToPlayer']('bot-static-close', closeBot, 'player-1', 60, performance.now(), 'sniper')
    assert.equal(closeBot.hp, 100)
    const blockedMsg = sentMessages.at(-1) as { type: string; payload: { blocked: boolean } }
    assert.equal(blockedMsg.type, 'damage_feedback')
    assert.equal(blockedMsg.payload.blocked, true)

    // Desactiva escudo, elimina al NPC: suma kill de práctica, no termina partida ni escribe ResultStore.
    room['lastPracticeActionAt'].clear()
    room['handlePracticeAction'](client, { action: 'toggle_dummy_shield' })
    assert.equal(closeBot.shield, 0)

    const killAt = performance.now()
    room['applyDamageToPlayer']('bot-static-close', closeBot, 'player-1', 100, killAt, 'sniper')
    assert.equal(closeBot.isDead, true)
    assert.equal(human.kills, 1)
    assert.equal(room.state.phase, 'playing')
    assert.equal(beginCalls, 0)
    assert.equal(finishCalls, 0)

    // Reaparición rápida del NPC tras 1.5 s.
    room['updatePracticeBots'](0.05, killAt + PRACTICE_BOT_RESPAWN_MS + 5)
    assert.equal(closeBot.isDead, false)
    assert.equal(closeBot.hp, 100)

    // El blanco patrullero avanza hacia su destino al actualizar simulación.
    const patrolBot = room.state.players.get('bot-patrol-h')!
    const initialPatrolX = patrolBot.x
    room['updatePracticeBots'](0.25, performance.now())
    assert.ok(patrolBot.x > initialPatrolX)
  } finally {
    disposeTestRoom(room)
    store.close()
    await new Promise((r) => setTimeout(r, 20))
    await rm(directory, { recursive: true, force: true })
  }
})

test('practice_action equipa armas, respeta cooldown, recarga pads en 4s y limpia al salir', async () => {
  const room = new ArenaRoom()
  room.lock = async () => {}
  room.unlock = async () => {}

  const client = {
    sessionId: 'player-1',
    send() {},
  } as unknown as Client

  try {
    await room.onCreate({ gameMode: 'practice', environment: 'desert' })
    room.onJoin(client, {}, makeAccount('Arsenal'))

    const player = room.state.players.get('player-1')!

    // Cambiar arma a escopeta al instante.
    room['handlePracticeAction'](client, { action: 'equip_weapon', weapon: 'shotgun' })
    assert.equal(player.weaponType, 'shotgun')
    assert.equal(player.ammo, weaponsConfig.weapons.shotgun.maxAmmo)
    assert.equal(player.reserveAmmo, weaponsConfig.weapons.shotgun.maxAmmo * 2)

    // Rate-limit: una acción inmediata dentro de 100 ms se ignora.
    room['handlePracticeAction'](client, { action: 'self_damage' })
    assert.equal(player.hp, 100)

    // Tras limpiar ventana de cooldown, self_damage baja 50 HP y limpia escudo.
    room['lastPracticeActionAt'].clear()
    room['activateShield'](player, SHIELD_DURATION_MS, performance.now())
    room['handlePracticeAction'](client, { action: 'self_damage' })
    assert.equal(player.hp, 50)
    assert.equal(player.shield, 0)

    // Recoger el medkit en la estación inferior cura +50 HP y programa respawn en 4 s.
    const medkitPad = PRACTICE_POWERUP_STATIONS.find((s) => s.kind === 'medkit')!
    player.x = medkitPad.x
    player.y = medkitPad.y
    room['simulate'](16)
    assert.equal(player.hp, 100)
    assert.equal(room.state.powerUps.size, PRACTICE_POWERUP_STATIONS.length - 1)

    const padState = room['practicePowerUpPads'].get(medkitPad.id)!
    assert.equal(padState.activeId, '')
    assert.ok(padState.respawnAt > 0)

    // Al avanzar más allá de PRACTICE_POWERUP_RESPAWN_MS el pad vuelve a aparecer.
    room['updatePracticePowerUps'](padState.respawnAt + PRACTICE_POWERUP_RESPAWN_MS)
    assert.equal(room.state.powerUps.size, PRACTICE_POWERUP_STATIONS.length)

    // Refill restaura dashes al máximo y reset_dummies reinicia contador de bajas.
    player.dashes = 1
    player.hp = 35
    player.kills = 7
    room['lastPracticeActionAt'].clear()
    room['handlePracticeAction'](client, { action: 'refill' })
    assert.equal(player.hp, 100)
    assert.equal(player.dashes, MAX_DASHES)

    room['lastPracticeActionAt'].clear()
    room['handlePracticeAction'](client, { action: 'reset_dummies' })
    assert.equal(player.kills, 0)

    // Al salir el jugador humano, limpia bots y pads sin pasar a finished.
    room.onLeave(client)
    assert.equal(room['practiceBotMeta'].size, 0)
    assert.equal(room.state.players.size, 0)
  } finally {
    disposeTestRoom(room)
  }
})

test('practice_action es rechazado en salas normales FFA', async () => {
  const room = new ArenaRoom()
  room.lock = async () => {}
  room.unlock = async () => {}

  const client = { sessionId: 'ffa-1', send() {} } as unknown as Client

  try {
    await room.onCreate({ gameMode: 'ffa', maxPlayers: 4, environment: 'desert' })
    room.onJoin(client, {}, makeAccount('FfaPlayer'))
    room.onJoin({ sessionId: 'ffa-2', send() {} } as unknown as Client, {}, makeAccount('FfaTwo'))
    await room['startMatch']()

    const player = room.state.players.get('ffa-1')!
    assert.equal(player.weaponType, 'rifle')
    room['handlePracticeAction'](client, { action: 'equip_weapon', weapon: 'sniper' })
    room['handlePracticeAction'](client, { action: 'self_damage' })
    assert.equal(player.weaponType, 'rifle')
    assert.equal(player.hp, 100)
  } finally {
    disposeTestRoom(room)
  }
})

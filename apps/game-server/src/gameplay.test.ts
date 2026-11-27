import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from 'colyseus'
import { ArenaRoom } from './rooms/ArenaRoom.js'
import type { WeaponType } from './rooms/ArenaState.js'
import { parseArenaInput } from './rooms/ArenaInput.js'
import { overlapsObstacleWithRadius, pickRandomFreeArenaPoint } from './rooms/ArenaCollision.js'
import { getArenaMap } from './rooms/ArenaMaps.js'
import { ResultStore, resolveResults, type MatchResult, type Participant } from './results.js'
import weaponsConfig from '../../../packages/shared/weapons.json' with { type: 'json' }
import {
  DASH_RECHARGE_MS,
  GOLDEN_DURATION_MS,
  GUN_GAME_LADDER,
  LAUNCHER_EXPLOSION_RADIUS,
  MAX_DASHES,
  SHIELD_DURATION_MS,
  calculateExplosionDamage,
  maxActiveItemsForPlayers,
  normalizeGameMode,
  scaledSpawnIntervalMs,
} from '../../../packages/shared/gameplay.js'
import { PLAYER_HIT_RADIUS, PLAYER_HITBOX_OFFSET_Y } from '../../../packages/shared/movement.js'

function makeAccount(
  name: string,
  weapon: WeaponType = 'rifle',
  skin: 'fox' | 'squirrel' | 'mouse' | 'rabbit' = 'fox',
) {
  return {
    accountId: randomUUID(),
    name,
    expiresAt: Date.now() + 60_000,
    skin,
    teamColor: (skin === 'mouse' || skin === 'rabbit' ? 'blue' : 'orange') as 'orange' | 'blue',
    weapon,
  }
}

async function createStartedRoom(
  options: { gameMode?: 'ffa' | 'tdm' | 'gungame'; maxPlayers?: number } = {},
  initialPlayers: { id: string; auth: ReturnType<typeof makeAccount> }[] = [
    { id: 'a', auth: makeAccount('Uno') },
    { id: 'b', auth: makeAccount('Dos') },
  ],
) {
  const dir = await mkdtemp(join(tmpdir(), 'tap-war-gp-'))
  const sent: MatchResult[] = []
  const store = new ResultStore(dir, async (r) => {
    sent.push(r)
  })
  await store.initialize()
  const room = new ArenaRoom(store)
  room.lock = async () => {}
  room.unlock = async () => {}
  await room.onCreate(options)
  for (const { id, auth } of initialPlayers) {
    room.onJoin({ sessionId: id } as Client, {}, auth)
  }
  await room['startMatch']()

  const cleanup = async () => {
    room.setSimulationInterval(undefined as unknown as () => void)
    clearInterval((room as unknown as { _patchInterval?: ReturnType<typeof setInterval> })._patchInterval)
    room.onDispose()
    store.close()
    await new Promise((r) => setTimeout(r, 15))
    await rm(dir, { recursive: true, force: true })
  }

  return { room, sent, cleanup }
}

test('balance de armas: francotirador hace 100 de dano y hacha hace 90 (no mata de un golpe)', async () => {
  assert.equal(weaponsConfig.weapons.sniper.damage, 100)
  assert.equal(weaponsConfig.weapons.axe.damage, 90)

  const { room, cleanup } = await createStartedRoom({}, [
    { id: 'sniper', auth: makeAccount('Franco', 'sniper') },
    { id: 'axe', auth: makeAccount('Hachero', 'axe') },
    { id: 'target', auth: makeAccount('Blanco', 'rifle') },
  ])
  try {
    const axe = room.state.players.get('axe')!
    const sniper = room.state.players.get('sniper')!
    const target = room.state.players.get('target')!

    axe.x = 300
    axe.y = 300
    target.x = 340
    target.y = 300
    room['performMeleeAttack']('axe', axe, 'axe', 0, performance.now())
    assert.equal(target.hp, 10)
    assert.equal(target.isDead, false)

    axe.x = 128
    axe.y = 128
    target.hp = 100
    sniper.x = 300
    sniper.y = 300
    target.x = 330
    target.y = 300
    room['fireWeapon']('sniper', sniper, 0, performance.now())
    assert.equal(target.hp, 0)
    assert.equal(target.isDead, true)
  } finally {
    await cleanup()
  }
})

test('melee rapido con arma de fuego equipada funciona sin quitar el arma', async () => {
  const { room, cleanup } = await createStartedRoom({}, [
    { id: 'a', auth: makeAccount('Riflero', 'rifle') },
    { id: 'b', auth: makeAccount('Rival', 'rifle') },
  ])
  try {
    const a = room.state.players.get('a')!
    const b = room.state.players.get('b')!
    a.x = 300
    a.y = 300
    b.x = 340
    b.y = 300
    const beforeSeq = a.meleeAttackSeq

    room['tryQuickMelee']('a', a, 0, performance.now())

    assert.equal(a.weaponType, 'rifle')
    assert.equal(a.meleeAttackSeq, beforeSeq + 1)
    assert.equal(b.hp, 50) // default knife backup does 50 dmg
  } finally {
    await cleanup()
  }
})

test('cargador extra y recarga con R recargan municion desde reserva', async () => {
  const { room, cleanup } = await createStartedRoom({}, [
    { id: 'a', auth: makeAccount('Uno', 'pistol') },
    { id: 'b', auth: makeAccount('Dos', 'rifle') },
  ])
  try {
    const a = room.state.players.get('a')!
    assert.equal(a.ammo, 12)
    assert.equal(a.maxAmmo, 12)
    assert.equal(a.reserveAmmo, 12)

    a.x = 300
    a.y = 300
    let now = performance.now()
    for (let i = 0; i < 4; i++) {
      room['fireWeapon']('a', a, 0, now)
      now += 400
    }
    assert.equal(a.ammo, 8)
    assert.equal(a.reserveAmmo, 12)

    room['startReload'](a, now)
    assert.equal(a.isReloading, true)

    // Shooting while reloading does not fire.
    const bulletsBefore = room.state.bullets.size
    room['fireWeapon']('a', a, 0, now + 50)
    assert.equal(room.state.bullets.size, bulletsBefore)

    // Complete reload timer.
    a.reloadCompleteAt = performance.now() - 1
    room['simulate'](16)
    assert.equal(a.isReloading, false)
    assert.equal(a.ammo, 12)
    assert.equal(a.reserveAmmo, 8)
  } finally {
    await cleanup()
  }
})

test('dash consume hasta 5 por partida, respeta paredes, no reinicia al morir y nunca pasa de 5', async () => {
  const { room, cleanup } = await createStartedRoom()
  try {
    const a = room.state.players.get('a')!
    assert.equal(a.dashes, MAX_DASHES)
    a.x = 300
    a.y = 300

    const t0 = performance.now()
    room['tryDash']('a', a, { moveX: 1, moveY: 0, aimAngle: 0, dash: true }, t0)
    assert.equal(a.dashes, 4)
    assert.equal(a.dashSeq, 1)

    const xBefore = a.x
    room['simulate'](50)
    assert.ok(a.x > xBefore + 25, 'Dash debe desplazar mas rapido que caminar')

    // Respawn preserves remaining dashes for the match.
    a.isDead = true
    a.respawnAt = performance.now() - 1
    room['simulate'](16)
    assert.equal(a.isDead, false)
    assert.equal(a.dashes, 4)

    // Picking up dash power-ups restores charges but never exceeds 5.
    room['applyPowerUp']('a', a, 'dash', performance.now())
    assert.equal(a.dashes, 5)
    room['applyPowerUp']('a', a, 'dash', performance.now())
    assert.equal(a.dashes, 5)
  } finally {
    await cleanup()
  }
})

test('power-ups: cargador, botiquin +50, escudo 5s y power-up dorado 1 vez por partida (15s)', async () => {
  const { room, cleanup } = await createStartedRoom({}, [
    { id: 'a', auth: makeAccount('Uno', 'rifle') },
    { id: 'b', auth: makeAccount('Dos', 'rifle') },
  ])
  try {
    const a = room.state.players.get('a')!
    const now = performance.now()

    // Medkit heals +50 capped at 100.
    a.hp = 35
    assert.equal(room['applyPowerUp']('a', a, 'medkit', now), true)
    assert.equal(a.hp, 85)
    assert.equal(room['applyPowerUp']('a', a, 'medkit', now), true)
    assert.equal(a.hp, 100)
    assert.equal(room['applyPowerUp']('a', a, 'medkit', now), false)

    // Ammo power-up restores magazine.
    a.ammo = 0
    a.reserveAmmo = 0
    assert.equal(room['applyPowerUp']('a', a, 'ammo', now), true)
    assert.equal(a.ammo, 15)
    assert.equal(room['applyPowerUp']('a', a, 'ammo', now), true)
    assert.equal(a.reserveAmmo, 15)

    // Timed shield blocks shots WITHOUT breaking or losing shield until timer expires (5s).
    assert.equal(SHIELD_DURATION_MS, 5_000)
    assert.equal(room['applyPowerUp']('a', a, 'shield', now), true)
    assert.equal(a.shield, 100)
    assert.ok(a.shieldUntil >= now + SHIELD_DURATION_MS)
    room['applyDamageToPlayer']('a', a, 'b', 100, now)
    room['applyDamageToPlayer']('a', a, 'b', 90, now + 50)
    assert.equal(a.hp, 100, 'El escudo bloquea disparos sin recibir daño')
    assert.equal(a.shield, 100, 'Los disparos no deben quitar ni reducir el escudo')
    assert.ok(a.shieldRemaining > 0)
    a.shieldUntil = performance.now() - 1
    room['simulate'](16)
    assert.equal(a.shield, 0)
    assert.equal(a.shieldRemaining, 0)
    assert.equal(a.shieldProgress, 0)

    // Golden Power-Up spawns once near the end of the match.
    room.state.timeRemaining = 55
    room['simulate'](16)
    const goldens = [...room.state.powerUps.values()].filter((p) => p.kind === 'golden')
    assert.equal(goldens.length, 1)
    assert.ok(room.state.announcement.includes('Dorado'))

    // Collect Golden: full HP, 100 shield, infinite ammo for 15s.
    a.hp = 20
    a.ammo = 2
    const tGolden = performance.now()
    assert.equal(room['applyPowerUp']('a', a, 'golden', tGolden), true)
    assert.equal(a.hp, 100)
    assert.equal(a.shield, 100)
    assert.equal(a.ammo, 15)
    assert.ok(a.goldenUntil >= tGolden + GOLDEN_DURATION_MS)

    a.x = 300
    a.y = 300
    room['fireWeapon']('a', a, 0, tGolden + 10)
    assert.equal(a.ammo, 15, 'Municion infinita durante Power-Up Dorado')

    // Remove golden pickup and simulate again: golden must NOT spawn a second time.
    room.state.powerUps.clear()
    room['simulate'](16)
    assert.equal([...room.state.powerUps.values()].filter((p) => p.kind === 'golden').length, 0)
  } finally {
    await cleanup()
  }
})

test('unirse en curso y reconexion del mismo usuario conserva dashes y no duplica participantes', async () => {
  const accA = makeAccount('Uno')
  const accB = makeAccount('Dos')
  const accC = makeAccount('Tarde')
  const { room, cleanup } = await createStartedRoom(
    { maxPlayers: 4 },
    [
      { id: 'a', auth: accA },
      { id: 'b', auth: accB },
    ],
  )
  try {
    room.onJoin({ sessionId: 'c1' } as Client, {}, accC)
    const c1 = room.state.players.get('c1')!
    assert.equal(c1.dashes, 5)
    room['tryDash']('c1', c1, { moveX: 1, moveY: 0, aimAngle: 0, dash: true }, performance.now())
    assert.equal(c1.dashes, 4)

    // Leave and rejoin same match with same account.
    room.onLeave({ sessionId: 'c1' } as Client)
    room.onJoin({ sessionId: 'c2' } as Client, {}, accC)
    const c2 = room.state.players.get('c2')!
    assert.equal(c2.dashes, 4, 'Reingresar no debe reiniciar dashes a 5')
    assert.equal(room['participants'].size, 3, 'No debe duplicar accountId en participants')
  } finally {
    await cleanup()
  }
})

test('duelo por equipos (tdm): asigna equipos equilibrados, sin fuego amigo y gana el equipo lider', async () => {
  const { room, sent, cleanup } = await createStartedRoom(
    { gameMode: 'tdm', maxPlayers: 4 },
    [
      { id: 'a', auth: makeAccount('Naranja1', 'rifle', 'fox') },
      { id: 'b', auth: makeAccount('Naranja2', 'rifle', 'fox') },
      { id: 'c', auth: makeAccount('Azul1', 'rifle', 'mouse') },
      { id: 'd', auth: makeAccount('Azul2', 'rifle', 'rabbit') },
    ],
  )
  try {
    assert.equal(room.state.gameMode, 'tdm')
    const players = [...room.state.players.values()]
    const orange = players.filter((p) => p.team === 'orange')
    const blue = players.filter((p) => p.team === 'blue')
    assert.equal(orange.length, 2)
    assert.equal(blue.length, 2)

    // Friendly fire does 0 damage.
    const o1 = orange[0]
    const o2 = orange[1]
    const b1 = blue[0]
    room['applyDamageToPlayer'](o2.id, o2, o1.id, 80, performance.now())
    assert.equal(o2.hp, 100)

    // Enemy damage works and increments team score up to target.
    room.state.orangeScore = room.state.killsToWin - 1
    room['applyDamageToPlayer'](b1.id, b1, o1.id, 100, performance.now())
    assert.equal(room.state.phase, 'finished')
    assert.equal(room.state.winnerId, 'team:orange')
    assert.equal(room.state.winnerName, 'Equipo Naranja')

    for (let i = 0; i < 100 && !sent.length; i++) await new Promise((r) => setTimeout(r, 5))
    assert.equal(sent.length, 1)
    const orangePoints = sent[0].players.filter((p) => p.team === 'orange').map((p) => p.points)
    const bluePoints = sent[0].players.filter((p) => p.team === 'blue').map((p) => p.points)
    assert.deepEqual(orangePoints, [3, 3])
    assert.deepEqual(bluePoints, [0, 0])
  } finally {
    await cleanup()
  }
})

test('juego de armas (gungame): progresion de 10 armas, degradacion por melee rapido y victoria con cuchillo', async () => {
  const { room, cleanup } = await createStartedRoom(
    { gameMode: 'gungame', maxPlayers: 4 },
    [
      { id: 'a', auth: makeAccount('Uno', 'sniper') },
      { id: 'b', auth: makeAccount('Dos', 'shotgun') },
    ],
  )
  try {
    assert.equal(room.state.gameMode, 'gungame')
    const a = room.state.players.get('a')!
    const b = room.state.players.get('b')!

    // Everyone starts with tier 0 weapon (rifle) regardless of lobby choice.
    assert.equal(a.weaponTier, 0)
    assert.equal(a.weaponType, GUN_GAME_LADDER[0])
    assert.equal(b.weaponType, GUN_GAME_LADDER[0])

    // Kill with current tier weapon advances to next weapon.
    room['applyDamageToPlayer']('b', b, 'a', 100, performance.now(), a.weaponType)
    assert.equal(a.weaponTier, 1)
    assert.equal(a.weaponType, GUN_GAME_LADDER[1])

    // Quick-melee humiliation while on firearm tier demotes victim without advancing attacker.
    b.hp = 100
    b.isDead = false
    b.weaponTier = 3
    room['applyDamageToPlayer']('b', b, 'a', 100, performance.now(), 'knife')
    assert.equal(a.weaponTier, 1)
    assert.equal(b.weaponTier, 2)

    // Final tier (knife) kill wins immediately.
    a.weaponTier = GUN_GAME_LADDER.length - 1
    room['equipWeapon'](a, 'knife', true)
    b.hp = 100
    b.isDead = false
    room['applyDamageToPlayer']('b', b, 'a', 100, performance.now(), 'knife')
    assert.equal(room.state.phase, 'finished')
    assert.equal(room.state.winnerId, 'a')
    assert.equal(room.state.finishReason, 'kills')
  } finally {
    await cleanup()
  }
})

test('parseArenaInput valida melee, reload y dash y normalizeGameMode filtra valores', () => {
  assert.deepEqual(
    parseArenaInput({ moveX: 0, moveY: 1, aimAngle: 0, shoot: false, melee: true, reload: true, dash: true }),
    { moveX: 0, moveY: 1, aimAngle: 0, shoot: false, melee: true, reload: true, dash: true },
  )
  assert.equal(parseArenaInput({ moveX: 0, moveY: 0, aimAngle: 0, dash: 'yes' }), null)
  assert.equal(parseArenaInput({ moveX: 0, moveY: 0, aimAngle: 0, melee: 1 }), null)
  assert.equal(parseArenaInput({ moveX: 0, moveY: 0, aimAngle: 0, reload: null }), null)

  assert.equal(normalizeGameMode('tdm'), 'tdm')
  assert.equal(normalizeGameMode('gungame'), 'gungame')
  assert.equal(normalizeGameMode('invalid'), 'ffa')
})

test('resolveResults soporta empate en tdm y desempate por nivel en gungame', () => {
  const tdmPlayers: Participant[] = [
    { accountId: randomUUID(), sessionId: 'a', name: 'A', kills: 5, deaths: 2, abandoned: false, team: 'orange' },
    { accountId: randomUUID(), sessionId: 'b', name: 'B', kills: 5, deaths: 2, abandoned: false, team: 'blue' },
  ]
  assert.deepEqual(
    resolveResults(tdmPlayers, 'time', undefined, { gameMode: 'tdm', orangeScore: 5, blueScore: 5 }).map((p) => p.points),
    [1, 1],
  )

  const ggPlayers: Participant[] = [
    { accountId: randomUUID(), sessionId: 'a', name: 'A', kills: 6, deaths: 1, abandoned: false, weaponTier: 5 },
    { accountId: randomUUID(), sessionId: 'b', name: 'B', kills: 8, deaths: 4, abandoned: false, weaponTier: 4 },
  ]
  assert.deepEqual(
    resolveResults(ggPlayers, 'time', undefined, { gameMode: 'gungame' }).map((p) => p.points),
    [3, 0],
  )
})

test('lanzagranadas explota al impactar con radio y dano dependiente de la distancia', async () => {
  const maxDmg = weaponsConfig.weapons.launcher.damage
  assert.equal(calculateExplosionDamage(0, LAUNCHER_EXPLOSION_RADIUS, maxDmg), maxDmg)
  assert.equal(calculateExplosionDamage(20, LAUNCHER_EXPLOSION_RADIUS, maxDmg), maxDmg)
  const midDmg = calculateExplosionDamage(80, LAUNCHER_EXPLOSION_RADIUS, maxDmg)
  const edgeDmg = calculateExplosionDamage(LAUNCHER_EXPLOSION_RADIUS, LAUNCHER_EXPLOSION_RADIUS, maxDmg)
  assert.ok(midDmg < maxDmg && midDmg > edgeDmg, 'Dano disminuye con la distancia')
  assert.ok(edgeDmg > 0)
  assert.equal(calculateExplosionDamage(LAUNCHER_EXPLOSION_RADIUS + 1, LAUNCHER_EXPLOSION_RADIUS, maxDmg), 0)

  const { room, cleanup } = await createStartedRoom({}, [
    { id: 'shooter', auth: makeAccount('Bombardero', 'launcher') },
    { id: 'close', auth: makeAccount('Cerca', 'rifle') },
    { id: 'far', auth: makeAccount('Borde', 'rifle') },
    { id: 'safe', auth: makeAccount('Lejos', 'rifle') },
  ])
  try {
    const events: { type: string; payload: unknown }[] = []
    room.broadcast = ((type: string, payload: unknown) => {
      events.push({ type, payload })
    }) as typeof room.broadcast

    const close = room.state.players.get('close')!
    const far = room.state.players.get('far')!
    const safe = room.state.players.get('safe')!
    close.x = 300; close.y = 300
    far.x = 400; far.y = 300 // 100px away (< 128)
    safe.x = 600; safe.y = 300 // 300px away (> 128)

    room['detonateExplosion'](300, 300, LAUNCHER_EXPLOSION_RADIUS, maxDmg, 'shooter', 'launcher', performance.now())
    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'explosion')
    assert.equal(close.hp, 100 - maxDmg)
    assert.ok(far.hp < 100 && far.hp > close.hp, 'Jugador en el borde recibe menos dano que en el centro')
    assert.equal(safe.hp, 100, 'Jugador fuera del radio no recibe dano')
  } finally {
    await cleanup()
  }
})

test('dash recarga 1 carga cada 10 segundos y nunca excede 5', async () => {
  const { room, cleanup } = await createStartedRoom()
  try {
    const a = room.state.players.get('a')!
    a.x = 300
    a.y = 300
    const t0 = performance.now()
    room['tryDash']('a', a, { moveX: 1, moveY: 0, aimAngle: 0, dash: true }, t0)
    assert.equal(a.dashes, 4)

    // Halfway through 10s recharge.
    a.dashRechargeStartAt = performance.now() - DASH_RECHARGE_MS / 2
    room['simulate'](16)
    assert.equal(a.dashes, 4)
    assert.ok(a.dashRechargeProgress >= 0.45 && a.dashRechargeProgress <= 0.6)

    // After 10s elapsed, dash recharges +1 back to 5 and progress resets to 0.
    a.dashRechargeStartAt = performance.now() - DASH_RECHARGE_MS - 20
    room['simulate'](16)
    assert.equal(a.dashes, MAX_DASHES)
    assert.equal(a.dashRechargeProgress, 0)
  } finally {
    await cleanup()
  }
})

test('spawns aleatorios respetan obstaculos y escalan con mas jugadores', () => {
  for (const env of ['desert', 'industrial'] as const) {
    for (const size of ['small', 'medium', 'large'] as const) {
      const map = getArenaMap(size, env)
      const generated = new Set<string>()
      for (let i = 0; i < 20; i++) {
        const point = pickRandomFreeArenaPoint(map, [], { clearance: 30 })
        assert.equal(overlapsObstacleWithRadius(point.x, point.y, 28, map), false)
        generated.add(`${point.x},${point.y}`)
      }
      assert.ok(generated.size > 5, 'Spawns deben variar aleatoriamente')
    }
  }

  assert.ok(scaledSpawnIntervalMs(12000, 10) < scaledSpawnIntervalMs(12000, 2))
  assert.ok(scaledSpawnIntervalMs(12000, 20) < scaledSpawnIntervalMs(12000, 6))
  assert.ok(maxActiveItemsForPlayers(10, 'medium', 'powerup') > maxActiveItemsForPlayers(2, 'medium', 'powerup'))
  assert.ok(maxActiveItemsForPlayers(20, 'large', 'weapon') > maxActiveItemsForPlayers(2, 'large', 'weapon'))
})

test('escopeta dispara 4 perdigones con dispersion reducida (-9, -3, +3, +9 grados)', async () => {
  assert.equal(weaponsConfig.weapons.shotgun.pellets, 4)
  assert.equal(weaponsConfig.weapons.shotgun.spreadDeg, 6)

  const { room, cleanup } = await createStartedRoom({}, [
    { id: 'sg', auth: makeAccount('Escopetero', 'shotgun') },
    { id: 'b', auth: makeAccount('Rival', 'rifle') },
  ])
  try {
    const sg = room.state.players.get('sg')!
    const b = room.state.players.get('b')!
    sg.x = 280
    sg.y = 300
    b.x = 680
    b.y = 300

    room['fireWeapon']('sg', sg, 0, performance.now())

    const anglesDeg = Array.from(room.state.bullets.values())
      .map((bullet) => (bullet.angle * 180) / Math.PI)
      .sort((a, z) => a - z)
    assert.equal(anglesDeg.length, 4)
    const expectedDeg = [-9, -3, 3, 9]
    anglesDeg.forEach((deg, idx) => {
      assert.ok(Math.abs(deg - expectedDeg[idx]!) < 0.001, `expected ${expectedDeg[idx]} deg, got ${deg}`)
    })
  } finally {
    await cleanup()
  }
})

test('hitbox centrado en el torso acierta en cabeza/torso y no por debajo de los pies ni fuera de radio', async () => {
  assert.equal(PLAYER_HIT_RADIUS, 23)
  assert.equal(PLAYER_HITBOX_OFFSET_Y, -20)

  const { room, cleanup } = await createStartedRoom({}, [
    { id: 'sniper', auth: makeAccount('Franco', 'sniper') },
    { id: 'target', auth: makeAccount('Blanco', 'rifle') },
  ])
  try {
    const sniper = room.state.players.get('sniper')!
    const target = room.state.players.get('target')!
    sniper.x = 290
    sniper.y = 300 // bullet travels horizontally along y = 288 (muzzle offset -12)

    const shootHorizontalAtTargetY = (targetY: number) => {
      room.state.bullets.clear()
      target.hp = 100
      target.isDead = false
      target.x = 340
      target.y = targetY
      sniper.ammo = sniper.maxAmmo
      room['fireWeapon']('sniper', sniper, 0, performance.now())
      for (let i = 0; i < 6; i++) {
        room['simulate'](16)
      }
      return target.hp < 100
    }

    // Horizontal shot passing through upper head (target.y - 36 -> 16 px from torso center) hits.
    assert.equal(shootHorizontalAtTargetY(324), true)
    // Horizontal shot passing below feet (target.y + 16 -> 36 px from torso center) misses.
    assert.equal(shootHorizontalAtTargetY(272), false)
    // Horizontal shot 26 px away from torso center (target.y - 46 -> |288 - 314| = 26 > 23) misses.
    assert.equal(shootHorizontalAtTargetY(334), false)
  } finally {
    await cleanup()
  }
})

test('handleEmote permite emote custom solo cuando el jugador tiene emote personalizado verificado', async () => {
  const { room, cleanup } = await createStartedRoom()
  try {
    const playerA = room.state.players.get('a')!
    const clientA = { sessionId: 'a' } as Client

    playerA.hasCustomEmote = false
    room['handleEmote'](clientA, 'custom')
    assert.equal(playerA.emote, '')

    playerA.hasCustomEmote = true
    room['handleEmote'](clientA, 'custom')
    assert.equal(playerA.emote, 'custom')
    assert.ok(playerA.emoteUntil > Date.now())
  } finally {
    await cleanup()
  }
})

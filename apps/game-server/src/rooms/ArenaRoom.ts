import { ErrorCode, Room, ServerError, type Client } from 'colyseus'
import {
    ArenaState,
    BulletState,
    Player,
    WeaponPickup,
    type PlayerSkin,
    type WeaponType,
} from './ArenaState.js'
import { parseArenaInput, type ArenaInput } from './ArenaInput.js'
import arena from '../../../../packages/shared/arena.json' with { type: 'json' }
import weaponsConfig from '../../../../packages/shared/weapons.json' with { type: 'json' }
import {
    intersectsPlayerHitbox,
    isBulletHittingObstacle,
    moveInsideArena,
} from './ArenaCollision.js'

const STEP_MS = 1000 / 30
const INPUT_TIMEOUT_MS = 300
const SPEED = 220
const BULLET_LIFETIME_MS = 2000
const MUZZLE_OFFSET = 28
const PLAYER_HIT_RADIUS = 26
const RESPAWN_DELAY_MS = 3000
const MATCH_DURATION_SECONDS = 180
const KILLS_TO_WIN = 10
const PICKUP_WEAPONS: WeaponType[] = ['shotgun', 'sniper']

export class ArenaRoom extends Room {
    maxClients = arena.spawnPoints.length
    autoDispose = false
    state = new ArenaState()

    patchRate = 50
    private inputs = new Map<string, ArenaInput & { receivedAt: number }>()
    private bulletCreatedAt = new Map<string, number>()
    private nextBulletId = 0
    private nextPickupId = 0
    private nextPickupAt = 0

    onCreate() {
        this.roomId = 'arena-local'

        this.onMessage<unknown>('input', (client, message) => {
            const input = parseArenaInput(message)
            const player = this.state.players.get(client.sessionId)
            if (!input || !player || player.isDead || this.state.phase === 'finished') return

            const now = performance.now()
            this.inputs.set(client.sessionId, {
                ...input,
                receivedAt: now,
            })
            player.aimAngle = input.aimAngle

            const weaponSpec = weaponsConfig.weapons[player.weaponType]
            if (
                this.state.phase === 'playing' &&
                input.shoot === true &&
                now - player.lastShotAt >= weaponSpec.cooldownMs
            ) {
                player.lastShotAt = now
                this.fireWeapon(client.sessionId, player, input.aimAngle, now)
            }
        })

        this.onMessage('rematch', () => {
            if (this.state.phase !== 'finished') return
            if (this.state.players.size >= 2) {
                this.startMatch()
            } else {
                this.resetToWaiting()
            }
        })

        this.onMessage<unknown>('emote', (client, message) => {
            if (message !== 'dots' && message !== 'alert') return
            const player = this.state.players.get(client.sessionId)
            if (!player) return

            player.emote = message
            player.emoteUntil = Date.now() + 2000
        })

        this.setSimulationInterval((deltaMs) => this.simulate(deltaMs), STEP_MS)
    }

    private clearCombatEntities() {
        this.state.bullets.clear()
        this.state.pickups.clear()
        this.bulletCreatedAt.clear()
        this.inputs.clear()
    }

    private startMatch() {
        const now = performance.now()
        this.clearCombatEntities()
        this.state.phase = 'playing'
        this.state.timeRemaining = MATCH_DURATION_SECONDS
        this.state.killsToWin = KILLS_TO_WIN
        this.state.winnerId = ''
        this.state.winnerName = ''
        this.nextPickupAt = now + weaponsConfig.pickupIntervalMs

        let index = 0
        for (const player of this.state.players.values()) {
            const spawn = arena.spawnPoints[index % arena.spawnPoints.length]
            player.x = spawn.x
            player.y = spawn.y
            player.hp = 100
            player.kills = 0
            player.deaths = 0
            player.isDead = false
            player.weaponType = 'rifle'
            player.emote = ''
            player.emoteUntil = 0
            player.respawnAt = 0
            player.lastShotAt = -1000
            index++
        }
    }

    private resetToWaiting() {
        this.clearCombatEntities()
        this.state.phase = 'waiting'
        this.state.timeRemaining = MATCH_DURATION_SECONDS
        this.state.winnerId = ''
        this.state.winnerName = ''
        this.nextPickupAt = 0

        for (const player of this.state.players.values()) {
            player.hp = 100
            player.kills = 0
            player.deaths = 0
            player.isDead = false
            player.weaponType = 'rifle'
            player.emote = ''
            player.emoteUntil = 0
            player.respawnAt = 0
            player.lastShotAt = -1000
        }
    }

    private finishMatch(winnerId: string, winnerName: string) {
        this.clearCombatEntities()
        this.state.phase = 'finished'
        this.state.winnerId = winnerId
        this.state.winnerName = winnerName
    }

    private finishMatchByTime() {
        let topKills = -1
        let leaders: Player[] = []

        for (const player of this.state.players.values()) {
            if (player.kills > topKills) {
                topKills = player.kills
                leaders = [player]
            } else if (player.kills === topKills) {
                leaders.push(player)
            }
        }

        if (leaders.length === 1) {
            this.finishMatch(leaders[0].id, leaders[0].name)
        } else {
            this.finishMatch('', '')
        }
    }

    private fireWeapon(ownerId: string, player: Player, aimAngle: number, now: number) {
        const spec = weaponsConfig.weapons[player.weaponType]
        const spreadRad = (spec.spreadDeg * Math.PI) / 180
        const halfPellets = (spec.pellets - 1) / 2

        for (let i = 0; i < spec.pellets; i++) {
            const offsetIndex = i - halfPellets
            const angle = aimAngle + offsetIndex * spreadRad
            this.spawnBullet(ownerId, player, angle, spec.bulletSpeed, spec.damage, now)
        }
    }

    private spawnBullet(
        ownerId: string,
        player: Player,
        angle: number,
        speed: number,
        damage: number,
        now: number,
    ) {
        const bullet = new BulletState()
        bullet.id = `b-${++this.nextBulletId}`
        bullet.ownerId = ownerId
        bullet.angle = angle
        bullet.x = player.x + Math.cos(angle) * MUZZLE_OFFSET
        bullet.y = player.y + Math.sin(angle) * MUZZLE_OFFSET
        bullet.vx = Math.cos(angle) * speed
        bullet.vy = Math.sin(angle) * speed
        bullet.damage = damage

        this.state.bullets.set(bullet.id, bullet)
        this.bulletCreatedAt.set(bullet.id, now)
    }

    private simulate(deltaMs: number) {
        const wallNow = Date.now()
        for (const player of this.state.players.values()) {
            if (player.emote !== '' && wallNow >= player.emoteUntil) {
                player.emote = ''
                player.emoteUntil = 0
            }
        }

        if (this.state.phase === 'finished') return

        const now = performance.now()
        const dt = deltaMs / 1000

        for (const [id, input] of this.inputs) {
            if (now - input.receivedAt >= INPUT_TIMEOUT_MS) {
                this.inputs.delete(id)
                continue
            }

            const player = this.state.players.get(id)
            if (!player || player.isDead) continue

            const length = Math.hypot(input.moveX, input.moveY)
            if (length === 0) continue

            const distance = SPEED * dt
            const next = moveInsideArena(
                player,
                (input.moveX / length) * distance,
                (input.moveY / length) * distance,
            )

            player.x = next.x
            player.y = next.y
        }

        if (this.state.phase !== 'playing') return

        this.state.timeRemaining = Math.max(0, this.state.timeRemaining - dt)

        for (const [bulletId, bullet] of this.state.bullets) {
            bullet.x += bullet.vx * dt
            bullet.y += bullet.vy * dt

            const createdAt = this.bulletCreatedAt.get(bulletId) ?? now
            const outOfBounds =
                bullet.x < 0 ||
                bullet.x > arena.width ||
                bullet.y < 0 ||
                bullet.y > arena.height
            const expired = now - createdAt >= BULLET_LIFETIME_MS

            if (outOfBounds || expired || isBulletHittingObstacle(bullet.x, bullet.y)) {
                this.state.bullets.delete(bulletId)
                this.bulletCreatedAt.delete(bulletId)
                continue
            }

            for (const [playerId, target] of this.state.players) {
                if (playerId === bullet.ownerId || target.isDead || target.hp <= 0) continue

                if (intersectsPlayerHitbox(bullet.x, bullet.y, target.x, target.y, PLAYER_HIT_RADIUS)) {
                    this.state.bullets.delete(bulletId)
                    this.bulletCreatedAt.delete(bulletId)

                    target.hp = Math.max(0, target.hp - bullet.damage)
                    if (target.hp <= 0) {
                        target.hp = 0
                        target.isDead = true
                        target.respawnAt = now + RESPAWN_DELAY_MS
                        target.deaths += 1
                        this.inputs.delete(playerId)

                        const attacker = this.state.players.get(bullet.ownerId)
                        if (attacker) {
                            attacker.kills += 1
                            if (attacker.kills >= this.state.killsToWin) {
                                this.finishMatch(attacker.id, attacker.name)
                                return
                            }
                        }
                    }
                    break
                }
            }
        }

        if (now >= this.nextPickupAt) {
            this.nextPickupAt = now + weaponsConfig.pickupIntervalMs
            this.spawnWeaponPickup()
        }

        for (const [pickupId, pickup] of this.state.pickups) {
            for (const player of this.state.players.values()) {
                if (player.isDead) continue
                const dist = Math.hypot(player.x - pickup.x, player.y - pickup.y)
                if (dist <= weaponsConfig.pickupRadius) {
                    player.weaponType = pickup.weaponType
                    this.state.pickups.delete(pickupId)
                    break
                }
            }
        }

        for (const [playerId, player] of this.state.players) {
            if (!player.isDead || now < player.respawnAt) continue

            const spawn = this.selectSafestSpawnPoint(playerId)
            player.x = spawn.x
            player.y = spawn.y
            player.hp = 100
            player.weaponType = 'rifle'
            player.isDead = false
            player.respawnAt = 0
        }

        if (this.state.timeRemaining <= 0) {
            this.finishMatchByTime()
        }
    }

    private spawnWeaponPickup() {
        const existingPickups = Array.from(this.state.pickups.values())
        const availableSpots = weaponsConfig.pickupSpawnPoints.filter((spot) =>
            existingPickups.every((p) => p.x !== spot.x || p.y !== spot.y),
        )
        if (availableSpots.length === 0) return

        const spot = availableSpots[Math.floor(Math.random() * availableSpots.length)]
        const weaponType = PICKUP_WEAPONS[Math.floor(Math.random() * PICKUP_WEAPONS.length)]

        const pickup = new WeaponPickup()
        pickup.id = `pk-${++this.nextPickupId}`
        pickup.weaponType = weaponType
        pickup.x = spot.x
        pickup.y = spot.y
        this.state.pickups.set(pickup.id, pickup)
    }

    private selectSafestSpawnPoint(respawningPlayerId: string): { x: number; y: number } {
        const livingRivals = Array.from(this.state.players.values()).filter(
            (other) => other.id !== respawningPlayerId && !other.isDead,
        )

        if (livingRivals.length === 0) {
            return arena.spawnPoints[0]
        }

        let bestSpawn = arena.spawnPoints[0]
        let bestMinDist = -1

        for (const candidate of arena.spawnPoints) {
            let minDist = Infinity
            for (const rival of livingRivals) {
                const dist = Math.hypot(candidate.x - rival.x, candidate.y - rival.y)
                if (dist < minDist) minDist = dist
            }
            if (minDist > bestMinDist) {
                bestMinDist = minDist
                bestSpawn = candidate
            }
        }

        return bestSpawn
    }

    onAuth(_client: Client, options?: { name?: unknown; skin?: unknown }) {
        const name = typeof options?.name === 'string' ? options.name.trim() : ''

        if (name.length < 1 || name.length > 24) {
            throw new ServerError(
                ErrorCode.AUTH_FAILED,
                'El nombre temporal debe tener entre 1 y 24 caracteres.',
            )
        }

        const rawSkin = typeof options?.skin === 'string' ? options.skin : 'fox'
        const skin: PlayerSkin = weaponsConfig.skins.includes(rawSkin)
            ? (rawSkin as PlayerSkin)
            : 'fox'

        return { name, skin }
    }

    onJoin(client: Client, _options: unknown, auth: { name: string; skin: PlayerSkin }) {
        const players = Array.from(this.state.players.values())
        const spawn = arena.spawnPoints.find(({ x, y }) =>
            players.every((player) => player.x !== x || player.y !== y),
        )

        if (!spawn) {
            throw new Error('No hay un punto de aparición disponible')
        }

        const player = new Player()
        player.id = client.sessionId
        player.name = auth.name
        player.skin = auth.skin
        player.weaponType = 'rifle'
        player.x = spawn.x
        player.y = spawn.y

        this.state.players.set(player.id, player)

        if (this.state.phase === 'waiting' && this.state.players.size >= 2) {
            this.startMatch()
        }
    }

    onLeave(client: Client) {
        this.inputs.delete(client.sessionId)
        this.state.players.delete(client.sessionId)

        if (this.state.players.size < 2 && this.state.phase === 'playing') {
            this.resetToWaiting()
        } else if (this.state.players.size === 0) {
            this.resetToWaiting()
        }
    }
}
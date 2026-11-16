import { ErrorCode, Room, ServerError, type Client } from 'colyseus'
import { ArenaState, BulletState, Player } from './ArenaState.js'
import { parseArenaInput, type ArenaInput } from './ArenaInput.js'
import arena from '../../../../packages/shared/arena.json' with { type: 'json' }
import {
    intersectsPlayerHitbox,
    isBulletHittingObstacle,
    moveInsideArena,
} from './ArenaCollision.js'

const STEP_MS = 1000 / 30
const INPUT_TIMEOUT_MS = 300
const SPEED = 220
const FIRE_COOLDOWN_MS = 300
const BULLET_SPEED = 650
const BULLET_LIFETIME_MS = 2000
const MUZZLE_OFFSET = 28
const BULLET_DAMAGE = 25
const PLAYER_HIT_RADIUS = 26
const RESPAWN_DELAY_MS = 3000
const MATCH_DURATION_SECONDS = 180
const KILLS_TO_WIN = 10

export class ArenaRoom extends Room {
    maxClients = arena.spawnPoints.length
    autoDispose = false
    state = new ArenaState()

    patchRate = 50
    private inputs = new Map<string, ArenaInput & { receivedAt: number }>()
    private bulletCreatedAt = new Map<string, number>()
    private nextBulletId = 0

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

            if (
                this.state.phase === 'playing' &&
                input.shoot === true &&
                now - player.lastShotAt >= FIRE_COOLDOWN_MS
            ) {
                player.lastShotAt = now
                this.spawnBullet(client.sessionId, player, input.aimAngle, now)
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

        this.setSimulationInterval((deltaMs) => this.simulate(deltaMs), STEP_MS)
    }

    private clearCombatEntities() {
        this.state.bullets.clear()
        this.bulletCreatedAt.clear()
        this.inputs.clear()
    }

    private startMatch() {
        this.clearCombatEntities()
        this.state.phase = 'playing'
        this.state.timeRemaining = MATCH_DURATION_SECONDS
        this.state.killsToWin = KILLS_TO_WIN
        this.state.winnerId = ''
        this.state.winnerName = ''

        let index = 0
        for (const player of this.state.players.values()) {
            const spawn = arena.spawnPoints[index % arena.spawnPoints.length]
            player.x = spawn.x
            player.y = spawn.y
            player.hp = 100
            player.kills = 0
            player.deaths = 0
            player.isDead = false
            player.respawnAt = 0
            player.lastShotAt = -FIRE_COOLDOWN_MS
            index++
        }
    }

    private resetToWaiting() {
        this.clearCombatEntities()
        this.state.phase = 'waiting'
        this.state.timeRemaining = MATCH_DURATION_SECONDS
        this.state.winnerId = ''
        this.state.winnerName = ''

        for (const player of this.state.players.values()) {
            player.hp = 100
            player.kills = 0
            player.deaths = 0
            player.isDead = false
            player.respawnAt = 0
            player.lastShotAt = -FIRE_COOLDOWN_MS
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

    private spawnBullet(ownerId: string, player: Player, angle: number, now: number) {
        const bullet = new BulletState()
        bullet.id = `b-${++this.nextBulletId}`
        bullet.ownerId = ownerId
        bullet.angle = angle
        bullet.x = player.x + Math.cos(angle) * MUZZLE_OFFSET
        bullet.y = player.y + Math.sin(angle) * MUZZLE_OFFSET
        bullet.vx = Math.cos(angle) * BULLET_SPEED
        bullet.vy = Math.sin(angle) * BULLET_SPEED

        this.state.bullets.set(bullet.id, bullet)
        this.bulletCreatedAt.set(bullet.id, now)
    }

    private simulate(deltaMs: number) {
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

                    target.hp = Math.max(0, target.hp - BULLET_DAMAGE)
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

        for (const [playerId, player] of this.state.players) {
            if (!player.isDead || now < player.respawnAt) continue

            const spawn = this.selectSafestSpawnPoint(playerId)
            player.x = spawn.x
            player.y = spawn.y
            player.hp = 100
            player.isDead = false
            player.respawnAt = 0
        }

        if (this.state.timeRemaining <= 0) {
            this.finishMatchByTime()
        }
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

    onAuth(_client: Client, options?: { name?: unknown }) {
        const name = typeof options?.name === 'string' ? options.name.trim() : ''

        if (name.length < 1 || name.length > 24) {
            throw new ServerError(
                ErrorCode.AUTH_FAILED,
                'El nombre temporal debe tener entre 1 y 24 caracteres.',
            )
        }

        return { name }
    }

    onJoin(client: Client, _options: unknown, auth:{ name: string }) {
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
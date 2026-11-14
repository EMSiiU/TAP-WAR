import { ErrorCode, Room, ServerError, type Client } from 'colyseus'
import { ArenaState, BulletState, Player } from './ArenaState.js'
import { parseArenaInput, type ArenaInput } from './ArenaInput.js'
import arena from '../../../../packages/shared/arena.json' with { type: 'json' }
import { moveInsideArena } from './ArenaCollision.js'

const STEP_MS = 1000 / 30
const INPUT_TIMEOUT_MS = 300
const SPEED = 220
const FIRE_COOLDOWN_MS = 300
const BULLET_SPEED = 650
const BULLET_LIFETIME_MS = 2000
const MUZZLE_OFFSET = 28

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
            if (!input || !player) return

            const now = performance.now()
            this.inputs.set(client.sessionId, {
                ...input,
                receivedAt: now,
            })
            player.aimAngle = input.aimAngle

            if (input.shoot === true && now - player.lastShotAt >= FIRE_COOLDOWN_MS) {
                player.lastShotAt = now
                this.spawnBullet(client.sessionId, player, input.aimAngle, now)
            }
        })

        this.setSimulationInterval((deltaMs) => this.simulate(deltaMs), STEP_MS)
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
        const now = performance.now()
        const dt = deltaMs / 1000

        for (const [id, input] of this.inputs) {
            if (now - input.receivedAt >= INPUT_TIMEOUT_MS) {
                this.inputs.delete(id)
                continue
            }

            const player = this.state.players.get(id)
            if (!player) continue

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

            if (outOfBounds || expired) {
                this.state.bullets.delete(bulletId)
                this.bulletCreatedAt.delete(bulletId)
            }
        }
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
    }

    onLeave(client: Client) {
        this.inputs.delete(client.sessionId)
        this.state.players.delete(client.sessionId)
    }
}
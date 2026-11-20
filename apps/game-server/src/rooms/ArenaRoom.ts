import { ErrorCode, Room, ServerError, type Client } from 'colyseus'
import {
    ArenaState,
    BulletState,
    Player,
    WeaponPickup,
    type PlayerSkin,
    type TeamColor,
    type WeaponType,
} from './ArenaState.js'
import { parseArenaInput, type ArenaInput } from './ArenaInput.js'
import { verifyArenaAccount, type VerifiedAccount } from '../auth.js'
import arena from '../../../../packages/shared/arena.json' with { type: 'json' }
import weaponsConfig from '../../../../packages/shared/weapons.json' with { type: 'json' }
import {
    isBulletHittingObstacle,
    moveInsideArena,
    segmentBlockedByObstacle,
    segmentIntersectsPlayerHitbox,
} from './ArenaCollision.js'

const STEP_MS = 1000 / 30
const INPUT_TIMEOUT_MS = 300
const SPEED = 220
const BULLET_LIFETIME_MS = 2000
const MUZZLE_OFFSET = 38
const MUZZLE_OFFSET_Y = -12
const PLAYER_HIT_RADIUS = 30
const RESPAWN_DELAY_MS = 3000
const MATCH_DURATION_SECONDS = 180
const KILLS_TO_WIN = 10
const PICKUP_WEAPONS: WeaponType[] = ['shotgun', 'sniper', 'smg', 'launcher', 'plasma', 'axe']

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
    private accounts = new Map<string, { accountId: string; expiresAt: number; timer: ReturnType<typeof setTimeout> }>()
    private refreshRequests = new Map<string, { pending: boolean; at: number }>()

    private trackAccount(client: Client, account: VerifiedAccount) {
        const current = this.accounts.get(client.sessionId)
        if (current && current.expiresAt > account.expiresAt) return
        if (current) clearTimeout(current.timer)
        const timer = setTimeout(() => { void client.leave(4001) }, Math.max(0, account.expiresAt - Date.now()))
        this.accounts.set(client.sessionId, { accountId: account.accountId, expiresAt: account.expiresAt, timer })
    }

    onDispose() {
        for (const account of this.accounts.values()) clearTimeout(account.timer)
        this.accounts.clear()
        this.refreshRequests.clear()
    }

    onCreate() {
        this.roomId = 'arena-local'

        this.onMessage<unknown>('auth_refresh', async (client, message) => {
            const existing = this.accounts.get(client.sessionId)
            if (!existing) return
            const request = this.refreshRequests.get(client.sessionId)
            if (request && (request.pending || Date.now() - request.at < 5000)) return
            this.refreshRequests.set(client.sessionId, { pending: true, at: Date.now() })
            const token = typeof message === 'object' && message !== null && 'accessToken' in message
                ? message.accessToken : undefined
            try {
                const account = await verifyArenaAccount(token)
                if (!this.accounts.has(client.sessionId)) return
                if (account.accountId !== existing.accountId) { void client.leave(4001); return }
                this.trackAccount(client, account)
            } catch { void client.leave(4001) }
            finally {
                const current = this.refreshRequests.get(client.sessionId)
                if (current) current.pending = false
            }
        })

        this.onMessage<unknown>('input', (client, message) => {
            const input = parseArenaInput(message)
            const player = this.state.players.get(client.sessionId)
            if (
                !input ||
                !player ||
                player.isDead ||
                this.state.phase === 'finished' ||
                this.state.isPaused
            ) {
                return
            }

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
                if ('isMelee' in weaponSpec && weaponSpec.isMelee) {
                    this.performMeleeAttack(client.sessionId, player, input.aimAngle, now)
                } else {
                    this.fireWeapon(client.sessionId, player, input.aimAngle, now)
                }
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

        this.onMessage<unknown>('pause', (client, message) => {
            if (typeof message !== 'boolean' || this.state.phase === 'finished') return
            if (message) {
                const player = this.state.players.get(client.sessionId)
                this.state.isPaused = true
                this.state.pausedByName = player?.name ?? ''
                this.inputs.clear()
            } else {
                this.state.isPaused = false
                this.state.pausedByName = ''
            }
        })

        this.setSimulationInterval((deltaMs) => this.simulate(deltaMs), STEP_MS)
    }

    private clearCombatEntities() {
        this.state.bullets.clear()
        this.state.pickups.clear()
        this.bulletCreatedAt.clear()
        this.inputs.clear()
    }

    private equipWeapon(player: Player, weaponType: WeaponType, updateMeleeBackup = true) {
        const spec = weaponsConfig.weapons[weaponType]
        player.weaponType = weaponType
        if ('isMelee' in spec && spec.isMelee) {
            player.ammo = 0
            player.maxAmmo = 0
            if (updateMeleeBackup && (weaponType === 'knife' || weaponType === 'axe')) {
                player.lastMeleeWeapon = weaponType
            }
        } else {
            player.ammo = spec.maxAmmo
            player.maxAmmo = spec.maxAmmo
        }
    }

    private resetPlayerLoadout(player: Player) {
        player.lastMeleeWeapon = 'knife'
        this.equipWeapon(player, player.startingWeapon, true)
    }

    private startMatch() {
        const now = performance.now()
        this.clearCombatEntities()
        this.state.phase = 'playing'
        this.state.isPaused = false
        this.state.pausedByName = ''
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
            this.resetPlayerLoadout(player)
            player.emote = ''
            player.emoteUntil = 0
            player.meleeAttackSeq = 0
            player.lastMeleeAngle = 0
            player.respawnAt = 0
            player.lastShotAt = -1000
            index++
        }
    }

    private resetToWaiting() {
        this.clearCombatEntities()
        this.state.phase = 'waiting'
        this.state.isPaused = false
        this.state.pausedByName = ''
        this.state.timeRemaining = MATCH_DURATION_SECONDS
        this.state.winnerId = ''
        this.state.winnerName = ''
        this.nextPickupAt = 0

        for (const player of this.state.players.values()) {
            player.hp = 100
            player.kills = 0
            player.deaths = 0
            player.isDead = false
            this.resetPlayerLoadout(player)
            player.emote = ''
            player.emoteUntil = 0
            player.meleeAttackSeq = 0
            player.lastMeleeAngle = 0
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

    private performMeleeAttack(
        attackerId: string,
        attacker: Player,
        aimAngle: number,
        now: number,
    ) {
        const spec = weaponsConfig.weapons[attacker.weaponType] as {
            damage: number
            rangePx?: number
            arcDeg?: number
        }
        const rangePx = spec.rangePx ?? 58
        const halfArcRad = (((spec.arcDeg ?? 110) / 2) * Math.PI) / 180

        attacker.meleeAttackSeq += 1
        attacker.lastMeleeAngle = aimAngle

        for (const [targetId, target] of this.state.players) {
            if (targetId === attackerId || target.isDead || target.hp <= 0) continue

            const dx = target.x - attacker.x
            const dy = target.y - attacker.y
            const dist = Math.hypot(dx, dy)
            if (dist > rangePx) continue

            const angleToTarget = Math.atan2(dy, dx)
            const angleDiff = Math.atan2(
                Math.sin(angleToTarget - aimAngle),
                Math.cos(angleToTarget - aimAngle),
            )
            if (Math.abs(angleDiff) > halfArcRad) continue

            if (segmentBlockedByObstacle(attacker.x, attacker.y, target.x, target.y)) continue

            if (this.applyDamageToPlayer(targetId, target, attackerId, spec.damage, now)) {
                return
            }
        }
    }

    private applyDamageToPlayer(
        targetId: string,
        target: Player,
        attackerId: string,
        damage: number,
        now: number,
    ): boolean {
        target.hp = Math.max(0, target.hp - damage)
        if (target.hp <= 0) {
            target.hp = 0
            target.isDead = true
            target.respawnAt = now + RESPAWN_DELAY_MS
            target.deaths += 1
            this.inputs.delete(targetId)

            const attacker = this.state.players.get(attackerId)
            if (attacker) {
                attacker.kills += 1
                if (attacker.kills >= this.state.killsToWin) {
                    this.finishMatch(attacker.id, attacker.name)
                    return true
                }
            }
        }
        return false
    }

    private fireWeapon(ownerId: string, player: Player, aimAngle: number, now: number) {
        const spec = weaponsConfig.weapons[player.weaponType]
        const spreadRad = (spec.spreadDeg * Math.PI) / 180
        const halfPellets = (spec.pellets - 1) / 2

        for (let i = 0; i < spec.pellets; i++) {
            const offsetIndex = i - halfPellets
            const angle = aimAngle + offsetIndex * spreadRad
            this.spawnBullet(
                ownerId,
                player,
                angle,
                spec.speed,
                spec.damage,
                spec.bulletScale,
                player.teamColor,
                now,
            )
        }

        player.ammo = Math.max(0, player.ammo - 1)
        if (player.ammo <= 0) {
            player.weaponType = player.lastMeleeWeapon
            player.maxAmmo = 0
        }
    }

    private spawnBullet(
        ownerId: string,
        player: Player,
        angle: number,
        speed: number,
        damage: number,
        scale: number,
        teamColor: TeamColor,
        now: number,
    ) {
        const originX = player.x
        const originY = player.y + MUZZLE_OFFSET_Y
        const spawnX = originX + Math.cos(angle) * MUZZLE_OFFSET
        const spawnY = originY + Math.sin(angle) * MUZZLE_OFFSET

        if (segmentBlockedByObstacle(originX, originY, spawnX, spawnY) || isBulletHittingObstacle(spawnX, spawnY)) {
            return
        }

        for (const [playerId, target] of this.state.players) {
            if (playerId === ownerId || target.isDead || target.hp <= 0) continue

            if (segmentIntersectsPlayerHitbox(originX, originY, spawnX, spawnY, target.x, target.y, PLAYER_HIT_RADIUS)) {
                this.applyDamageToPlayer(playerId, target, ownerId, damage, now)
                return
            }
        }

        const bullet = new BulletState()
        bullet.id = `b-${++this.nextBulletId}`
        bullet.ownerId = ownerId
        bullet.weaponType = player.weaponType
        bullet.angle = angle
        bullet.x = spawnX
        bullet.y = spawnY
        bullet.vx = Math.cos(angle) * speed
        bullet.vy = Math.sin(angle) * speed
        bullet.damage = damage
        bullet.scale = scale
        bullet.teamColor = teamColor

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

        if (this.state.isPaused) {
            this.nextPickupAt += deltaMs
            for (const [bulletId, createdAt] of this.bulletCreatedAt) {
                this.bulletCreatedAt.set(bulletId, createdAt + deltaMs)
            }
            for (const player of this.state.players.values()) {
                if (player.isDead && player.respawnAt > 0) {
                    player.respawnAt += deltaMs
                }
            }
            return
        }

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
            const prevX = bullet.x
            const prevY = bullet.y
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

                if (
                    segmentIntersectsPlayerHitbox(
                        prevX,
                        prevY,
                        bullet.x,
                        bullet.y,
                        target.x,
                        target.y,
                        PLAYER_HIT_RADIUS,
                    )
                ) {
                    this.state.bullets.delete(bulletId)
                    this.bulletCreatedAt.delete(bulletId)

                    if (this.applyDamageToPlayer(playerId, target, bullet.ownerId, bullet.damage, now)) {
                        return
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
                    this.equipWeapon(player, pickup.weaponType, true)
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
            this.resetPlayerLoadout(player)
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

    async onAuth(_client: Client, options?: { accessToken?: unknown; skin?: unknown; weapon?: unknown }) {
        let account: VerifiedAccount
        try { account = await verifyArenaAccount(options?.accessToken) }
        catch (error) {
            // No exponer respuestas del proveedor ni incluir tokens en logs/errores.
            const message = error instanceof Error && [
                'Inicia sesión antes de entrar a la arena.',
                'La sesión no es válida. Vuelve a iniciar sesión.',
                'La sesión venció. Vuelve a iniciar sesión.',
                'No se pudo verificar tu perfil. Inténtalo de nuevo.',
                'Elige un username válido en tu perfil antes de jugar.',
            ].includes(error.message) ? error.message : 'No se pudo verificar tu cuenta. Inténtalo de nuevo.'
            throw new ServerError(ErrorCode.AUTH_FAILED, message)
        }

        const rawSkin = typeof options?.skin === 'string' ? options.skin : 'fox'
        const skin: PlayerSkin = weaponsConfig.skins.includes(rawSkin)
            ? (rawSkin as PlayerSkin)
            : 'fox'

        const teamColor: TeamColor = weaponsConfig.skinTeams.blue.includes(skin)
            ? 'blue'
            : 'orange'

        const rawWeapon = typeof options?.weapon === 'string' ? options.weapon : 'rifle'
        const weapon: WeaponType = Object.prototype.hasOwnProperty.call(
            weaponsConfig.weapons,
            rawWeapon,
        )
            ? (rawWeapon as WeaponType)
            : 'rifle'

        return { ...account, skin, teamColor, weapon }
    }

    onJoin(
        client: Client,
        _options: unknown,
        auth: VerifiedAccount & { skin: PlayerSkin; teamColor: TeamColor; weapon: WeaponType },
    ) {
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
        player.teamColor = auth.teamColor
        player.startingWeapon = auth.weapon
        this.resetPlayerLoadout(player)
        player.x = spawn.x
        player.y = spawn.y

        this.state.players.set(player.id, player)
        this.trackAccount(client, auth)

        if (this.state.phase === 'waiting' && this.state.players.size >= 2) {
            this.startMatch()
        }
    }

    onLeave(client: Client) {
        const account = this.accounts.get(client.sessionId)
        if (account) clearTimeout(account.timer)
        this.accounts.delete(client.sessionId)
        this.refreshRequests.delete(client.sessionId)
        const leavingPlayer = this.state.players.get(client.sessionId)
        this.inputs.delete(client.sessionId)
        this.state.players.delete(client.sessionId)

        if (this.state.isPaused && leavingPlayer && leavingPlayer.name === this.state.pausedByName) {
            this.state.isPaused = false
            this.state.pausedByName = ''
        }

        if (this.state.players.size < 2 && this.state.phase === 'playing') {
            this.resetToWaiting()
        } else if (this.state.players.size === 0) {
            this.resetToWaiting()
        }
    }
}

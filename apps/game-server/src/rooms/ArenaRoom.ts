import { randomUUID } from 'node:crypto'
import { getResultStore, resolveResults, type Participant, type ResultStore } from '../results.js'
import { ErrorCode, Room, ServerError, type Client } from 'colyseus'
import {
    ArenaState,
    BulletState,
    Player,
    PowerUpState,
    WeaponPickup,
    type MeleeWeaponType,
    type PlayerSkin,
    type TeamColor,
    type WeaponType,
} from './ArenaState.js'
import { parseArenaInput, type ArenaInput } from './ArenaInput.js'
import { verifyArenaAccount, type VerifiedAccount } from '../auth.js'
import weaponsConfig from '../../../../packages/shared/weapons.json' with { type: 'json' }
import {
    DASH_RECHARGE_MS,
    GOLDEN_DURATION_MS,
    GUN_GAME_LADDER,
    MAX_DASHES,
    MAX_RESERVE_MAGAZINES,
    MEDKIT_HEAL_AMOUNT,
    SHIELD_DURATION_MS,
    calculateExplosionDamage,
    maxActiveItemsForPlayers,
    normalizeGameMode,
    scaledSpawnIntervalMs,
    teamKillTargetForCapacity,
    type GameMode,
    type PowerUpKind,
} from '../../../../packages/shared/gameplay.js'
import {
    isBulletHittingObstacle,
    moveInsideArena,
    pickRandomFreeArenaPoint,
    segmentBlockedByObstacle,
    segmentIntersectsPlayerHitbox,
} from './ArenaCollision.js'
import {
    MAX_ACTIVE_ROOMS,
    activeRoomCount,
    allocateRoomCode,
    getArenaMap,
    mapSizeForCapacity,
    normalizeEnvironment,
    releaseRoomCode,
    sanitizeRoomName,
    type ArenaMapConfig,
} from './ArenaMaps.js'

const STEP_MS = 1000 / 30
const INPUT_TIMEOUT_MS = 300
const SPEED = 220
const DASH_SPEED = 880
const DASH_DURATION_MS = 160
const DASH_COOLDOWN_MS = 450
const BULLET_LIFETIME_MS = 2000
const MUZZLE_OFFSET = 38
const MUZZLE_OFFSET_Y = -12
const PLAYER_HIT_RADIUS = 30
const RESPAWN_DELAY_MS = 3000
const MATCH_DURATION_SECONDS = 300
const KILLS_TO_WIN_FFA = 20
const GOLDEN_TIME_THRESHOLD_SECONDS = 60
const MAX_MATCH_PARTICIPANTS = 20
const PICKUP_WEAPONS: WeaponType[] = ['shotgun', 'sniper', 'smg', 'launcher', 'plasma', 'axe']
const NORMAL_POWERUPS: Exclude<PowerUpKind, 'golden'>[] = ['ammo', 'medkit', 'shield', 'dash']

type WeaponSpec = {
    id: string
    name: string
    isMelee?: boolean
    cooldownMs: number
    reloadMs?: number
    damage: number
    explosionRadius?: number
    rangePx?: number
    arcDeg?: number
    speed: number
    pellets: number
    spreadDeg: number
    bulletScale: number
    maxAmmo: number
}

export type ArenaRoomOptions = {
    environment?: unknown
    gameMode?: unknown
    maxPlayers?: unknown
    isPrivate?: unknown
    roomName?: unknown
}

export class ArenaRoom extends Room {
    maxClients = 4
    autoDispose = true
    state = new ArenaState()

    patchRate = 50
    private arenaMap: ArenaMapConfig = getArenaMap('small')
    private matchId = ''
    private startedAt = ''
    private starting = false
    private resultStore?: ResultStore
    private participants = new Map<string, Participant>()
    private dashesByAccount = new Map<string, number>()
    private inputs = new Map<string, ArenaInput & { receivedAt: number }>()
    private bulletCreatedAt = new Map<string, number>()
    private nextBulletId = 0
    private nextPickupId = 0
    private nextPickupAt = 0
    private nextPowerUpId = 0
    private nextPowerUpAt = 0
    private goldenSpawned = false
    private announcementUntil = 0
    private accounts = new Map<string, { accountId: string; expiresAt: number; timer: ReturnType<typeof setTimeout> }>()
    private refreshRequests = new Map<string, { pending: boolean; at: number }>()

    constructor(resultStore?: ResultStore) {
        super()
        this.resultStore = resultStore
    }

    private weaponSpec(weaponType: WeaponType): WeaponSpec {
        return weaponsConfig.weapons[weaponType] as WeaponSpec
    }

    private isMeleeWeapon(weaponType: WeaponType): boolean {
        return Boolean(this.weaponSpec(weaponType).isMelee)
    }

    private targetKillsForMode(mode: GameMode, maxPlayers: number): number {
        if (mode === 'gungame') return GUN_GAME_LADDER.length
        if (mode === 'tdm') return teamKillTargetForCapacity(maxPlayers)
        return KILLS_TO_WIN_FFA
    }

    private syncMetadata() {
        const hostName = this.state.players.get(this.state.hostId)?.name ?? ''
        void this.setMetadata?.({
            code: this.state.roomCode,
            name: this.state.roomName,
            mapSize: this.state.mapSize,
            environment: this.state.environment,
            gameMode: this.state.gameMode,
            maxPlayers: this.state.maxPlayers,
            isPrivate: this.state.isPrivate,
            phase: this.state.phase,
            hostName,
        })?.catch?.(() => {})
    }

    private trackAccount(client: Client, account: VerifiedAccount) {
        const current = this.accounts.get(client.sessionId)
        if (current && current.expiresAt > account.expiresAt) return
        if (current) clearTimeout(current.timer)
        const timer = setTimeout(() => {
            void client.leave(4001)
        }, Math.max(0, account.expiresAt - Date.now()))
        this.accounts.set(client.sessionId, {
            accountId: account.accountId,
            expiresAt: account.expiresAt,
            timer,
        })
    }

    private setAnnouncement(text: string, durationMs = 4200, now = performance.now()) {
        this.state.announcement = text
        this.announcementUntil = text ? now + durationMs : 0
    }

    onDispose() {
        releaseRoomCode(this.roomId)
        for (const account of this.accounts.values()) clearTimeout(account.timer)
        this.accounts.clear()
        this.refreshRequests.clear()
    }

    async onCreate(options?: ArenaRoomOptions) {
        if (activeRoomCount() >= MAX_ACTIVE_ROOMS) {
            throw new ServerError(503, 'Se alcanzó el límite de salas activas. Inténtalo más tarde.')
        }

        const { maxPlayers, mapSize } = mapSizeForCapacity(options?.maxPlayers)
        const gameMode = normalizeGameMode(options?.gameMode)
        const isPrivate = options?.isPrivate === true
        const code = allocateRoomCode()

        this.roomId = code
        this.arenaMap = getArenaMap(mapSize, options?.environment)
        this.maxClients = maxPlayers

        this.state.roomCode = code
        this.state.roomName = sanitizeRoomName(options?.roomName, code)
        this.state.environment = normalizeEnvironment(options?.environment)
        this.state.gameMode = gameMode
        this.state.mapSize = mapSize
        this.state.maxPlayers = maxPlayers
        this.state.killsToWin = this.targetKillsForMode(gameMode, maxPlayers)
        this.state.isPrivate = isPrivate

        await this.setPrivate?.(isPrivate)?.catch?.(() => {})
        this.syncMetadata()

        this.onMessage<unknown>('auth_refresh', async (client, message) => {
            const existing = this.accounts.get(client.sessionId)
            if (!existing) return
            const request = this.refreshRequests.get(client.sessionId)
            if (request && (request.pending || Date.now() - request.at < 5000)) return
            this.refreshRequests.set(client.sessionId, { pending: true, at: Date.now() })
            const token =
                typeof message === 'object' && message !== null && 'accessToken' in message
                    ? message.accessToken
                    : undefined
            try {
                const account = await verifyArenaAccount(token)
                if (!this.accounts.has(client.sessionId)) return
                if (account.accountId !== existing.accountId) {
                    void client.leave(4001)
                    return
                }
                this.trackAccount(client, account)
            } catch {
                void client.leave(4001)
            } finally {
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

            if (this.state.phase !== 'playing') return

            if (input.dash === true) {
                this.tryDash(client.sessionId, player, input, now)
            }

            if (input.reload === true) {
                this.startReload(player, now)
            }

            if (input.melee === true) {
                this.tryQuickMelee(client.sessionId, player, input.aimAngle, now)
                return
            }

            if (input.shoot === true) {
                const weaponSpec = this.weaponSpec(player.weaponType)
                if (weaponSpec.isMelee) {
                    if (now - player.lastMeleeAt >= weaponSpec.cooldownMs) {
                        player.lastMeleeAt = now
                        player.lastShotAt = now
                        this.performMeleeAttack(
                            client.sessionId,
                            player,
                            player.weaponType as MeleeWeaponType,
                            input.aimAngle,
                            now,
                        )
                    }
                } else if (now - player.lastShotAt >= weaponSpec.cooldownMs) {
                    this.fireWeapon(client.sessionId, player, input.aimAngle, now)
                }
            }
        })

        this.onMessage('start', (client) => {
            if (
                client.sessionId === this.state.hostId &&
                this.state.phase === 'waiting' &&
                this.state.players.size >= 2 &&
                !this.starting
            ) {
                void this.startMatch()
            }
        })

        this.onMessage('rematch', (client) => {
            if (
                client.sessionId !== this.state.hostId ||
                this.state.phase !== 'finished' ||
                ['saving', 'failed'].includes(this.state.saveStatus)
            ) {
                return
            }
            this.resetToWaiting()
        })

        this.onMessage<unknown>('emote', (client, message) => {
            if (message !== 'dots' && message !== 'alert') return
            const player = this.state.players.get(client.sessionId)
            if (!player) return

            player.emote = message
            player.emoteUntil = Date.now() + 2000
        })

        // ESC is a personal menu: it never freezes a competitive round.
        this.setSimulationInterval((deltaMs) => this.simulate(deltaMs), STEP_MS)
    }

    private clearCombatEntities() {
        this.state.bullets.clear()
        this.state.pickups.clear()
        this.state.powerUps.clear()
        this.bulletCreatedAt.clear()
        this.inputs.clear()
        this.setAnnouncement('')
    }

    private cancelReload(player: Player) {
        player.isReloading = false
        player.reloadProgress = 0
        player.reloadCompleteAt = 0
        player.reloadDurationMs = 0
    }

    private clearBuffs(player: Player) {
        player.shield = 0
        player.shieldRemaining = 0
        player.shieldProgress = 0
        player.shieldUntil = 0
        player.shieldDurationMs = 0
        player.goldenRemaining = 0
        player.goldenUntil = 0
        player.dashUntil = 0
    }

    private equipWeapon(player: Player, weaponType: WeaponType, updateMeleeBackup = true) {
        const spec = this.weaponSpec(weaponType)
        player.weaponType = weaponType
        this.cancelReload(player)
        if (spec.isMelee) {
            player.ammo = 0
            player.maxAmmo = 0
            player.reserveAmmo = 0
            if (updateMeleeBackup && (weaponType === 'knife' || weaponType === 'axe')) {
                player.lastMeleeWeapon = weaponType
            }
        } else {
            player.ammo = spec.maxAmmo
            player.maxAmmo = spec.maxAmmo
            player.reserveAmmo = spec.maxAmmo
        }
    }

    private resetPlayerLoadout(player: Player) {
        player.lastMeleeWeapon = 'knife'
        if (this.state.gameMode === 'gungame') {
            const tierIndex = Math.max(0, Math.min(GUN_GAME_LADDER.length - 1, player.weaponTier))
            const tierWeapon = GUN_GAME_LADDER[tierIndex] as WeaponType
            this.equipWeapon(player, tierWeapon, tierWeapon === 'axe' || tierWeapon === 'knife')
            return
        }
        this.equipWeapon(player, player.startingWeapon, true)
    }

    private assignTeamForPlayer(preferred: TeamColor): TeamColor {
        let orangeCount = 0
        let blueCount = 0
        for (const p of this.state.players.values()) {
            if (p.team === 'orange') orangeCount++
            else if (p.team === 'blue') blueCount++
        }
        if (orangeCount < blueCount) return 'orange'
        if (blueCount < orangeCount) return 'blue'
        return preferred
    }

    private balanceTeamsForStart() {
        if (this.state.gameMode !== 'tdm') return
        const all = Array.from(this.state.players.values())
        const orange = all.filter((p) => p.team === 'orange')
        const blue = all.filter((p) => p.team === 'blue')

        for (const player of all) {
            if (player.team !== 'orange' && player.team !== 'blue') {
                const targetTeam: TeamColor = orange.length <= blue.length ? 'orange' : 'blue'
                player.team = targetTeam
                player.teamColor = targetTeam
                if (targetTeam === 'orange') orange.push(player)
                else blue.push(player)
            }
        }

        while (orange.length - blue.length > 1) {
            const moved = orange.pop()!
            moved.team = 'blue'
            moved.teamColor = 'blue'
            blue.push(moved)
        }
        while (blue.length - orange.length > 1) {
            const moved = blue.pop()!
            moved.team = 'orange'
            moved.teamColor = 'orange'
            orange.push(moved)
        }
    }

    private startReload(player: Player, now: number) {
        if (player.isDead || player.isReloading) return
        const spec = this.weaponSpec(player.weaponType)
        if (spec.isMelee) return
        if (now < player.goldenUntil) return
        if (player.ammo >= player.maxAmmo || player.reserveAmmo <= 0) return

        const duration = spec.reloadMs ?? 1100
        player.isReloading = true
        player.reloadProgress = 0
        player.reloadDurationMs = duration
        player.reloadCompleteAt = now + duration
    }

    private tryDash(sessionId: string, player: Player, input: ArenaInput, now: number) {
        if (player.isDead || player.dashes <= 0) return
        if (now < player.dashUntil || now < player.dashCooldownUntil) return

        const moveLen = Math.hypot(input.moveX, input.moveY)
        const dirX = moveLen > 0.05 ? input.moveX / moveLen : Math.cos(input.aimAngle)
        const dirY = moveLen > 0.05 ? input.moveY / moveLen : Math.sin(input.aimAngle)

        player.dashes = Math.max(0, player.dashes - 1)
        if (player.dashes < MAX_DASHES && player.dashRechargeStartAt === 0) {
            player.dashRechargeStartAt = now
            player.dashRechargeProgress = 0
        }
        const accountId = this.accounts.get(sessionId)?.accountId
        if (accountId) this.dashesByAccount.set(accountId, player.dashes)

        player.dashDirX = dirX
        player.dashDirY = dirY
        player.dashUntil = now + DASH_DURATION_MS
        player.dashCooldownUntil = now + DASH_COOLDOWN_MS
        player.dashSeq += 1
        player.dashAngle = Math.atan2(dirY, dirX)
    }

    private tryQuickMelee(attackerId: string, attacker: Player, aimAngle: number, now: number) {
        const meleeWeapon: MeleeWeaponType = this.isMeleeWeapon(attacker.weaponType)
            ? (attacker.weaponType as MeleeWeaponType)
            : this.state.gameMode === 'gungame'
              ? 'knife'
              : attacker.lastMeleeWeapon
        const meleeSpec = this.weaponSpec(meleeWeapon)
        if (now - attacker.lastMeleeAt < meleeSpec.cooldownMs) return

        attacker.lastMeleeAt = now
        this.performMeleeAttack(attackerId, attacker, meleeWeapon, aimAngle, now)
    }

    private async startMatch() {
        this.starting = true
        const id = randomUUID()
        const startedAt = new Date().toISOString()
        try {
            this.balanceTeamsForStart()
            const initialPlayers: Participant[] = [...this.state.players].map(([sessionId, player]) => ({
                sessionId,
                accountId: this.accounts.get(sessionId)!.accountId,
                name: player.name,
                kills: 0,
                deaths: 0,
                abandoned: false,
                team: player.team || undefined,
                weaponTier: 0,
            }))
            await (this.resultStore ?? getResultStore()).begin(id, startedAt, initialPlayers)
            if (this.state.players.size < 2) {
                return
            }
            this.matchId = id
            this.startedAt = startedAt
            this.participants.clear()
            this.dashesByAccount.clear()
            for (const [sessionId, player] of this.state.players) {
                const accountId = this.accounts.get(sessionId)!.accountId
                this.participants.set(sessionId, {
                    sessionId,
                    accountId,
                    name: player.name,
                    kills: 0,
                    deaths: 0,
                    abandoned: false,
                    team: player.team || undefined,
                    weaponTier: 0,
                })
                this.dashesByAccount.set(accountId, MAX_DASHES)
            }
            this.state.saveStatus = ''
            this.state.resultSummary = ''
            this.state.notice = ''
        } catch {
            this.state.notice =
                'No se pudo preparar la partida. Revisa SUPABASE_SECRET_KEY y el directorio MATCH_DATA_DIR del servidor.'
            return
        } finally {
            this.starting = false
        }

        const now = performance.now()
        this.clearCombatEntities()
        this.state.phase = 'playing'
        this.state.isPaused = false
        this.state.pausedByName = ''
        this.state.timeRemaining = MATCH_DURATION_SECONDS
        this.state.killsToWin = this.targetKillsForMode(this.state.gameMode, this.state.maxPlayers)
        this.state.orangeScore = 0
        this.state.blueScore = 0
        this.state.winnerId = ''
        this.state.winnerName = ''
        this.goldenSpawned = false
        const playerCount = this.state.players.size
        this.nextPickupAt = now + scaledSpawnIntervalMs(this.arenaMap.pickupIntervalMs, playerCount)
        this.nextPowerUpAt =
            now + Math.round(scaledSpawnIntervalMs(this.arenaMap.powerUpIntervalMs, playerCount) * 0.65)
        void this.unlock?.()?.catch?.(() => {})
        this.syncMetadata()

        let index = 0
        for (const player of this.state.players.values()) {
            const spawn = this.arenaMap.spawnPoints[index % this.arenaMap.spawnPoints.length]
            player.x = spawn.x
            player.y = spawn.y
            player.hp = 100
            player.kills = 0
            player.deaths = 0
            player.weaponTier = 0
            player.dashes = MAX_DASHES
            player.maxDashes = MAX_DASHES
            player.dashRechargeProgress = 0
            player.dashRechargeStartAt = 0
            player.dashSeq = 0
            player.dashAngle = 0
            player.dashCooldownUntil = 0
            player.isDead = false
            this.clearBuffs(player)
            this.resetPlayerLoadout(player)
            player.emote = ''
            player.emoteUntil = 0
            player.meleeAttackSeq = 0
            player.lastMeleeAngle = 0
            player.respawnAt = 0
            player.lastShotAt = -1000
            player.lastMeleeAt = -1000
            index++
        }
    }

    private resetToWaiting() {
        this.clearCombatEntities()
        void this.unlock?.()?.catch?.(() => {})
        this.state.phase = 'waiting'
        this.state.isPaused = false
        this.state.pausedByName = ''
        this.state.timeRemaining = MATCH_DURATION_SECONDS
        this.state.killsToWin = this.targetKillsForMode(this.state.gameMode, this.state.maxPlayers)
        this.state.orangeScore = 0
        this.state.blueScore = 0
        this.state.winnerId = ''
        this.state.winnerName = ''
        this.goldenSpawned = false
        this.nextPickupAt = 0
        this.nextPowerUpAt = 0
        this.dashesByAccount.clear()
        this.syncMetadata()

        for (const player of this.state.players.values()) {
            player.hp = 100
            player.kills = 0
            player.deaths = 0
            player.weaponTier = 0
            player.dashes = MAX_DASHES
            player.maxDashes = MAX_DASHES
            player.dashRechargeProgress = 0
            player.dashRechargeStartAt = 0
            player.dashSeq = 0
            player.dashAngle = 0
            player.dashCooldownUntil = 0
            player.isDead = false
            this.clearBuffs(player)
            this.resetPlayerLoadout(player)
            player.emote = ''
            player.emoteUntil = 0
            player.meleeAttackSeq = 0
            player.lastMeleeAngle = 0
            player.respawnAt = 0
            player.lastShotAt = -1000
            player.lastMeleeAt = -1000
        }
    }

    private snapshotPlayers() {
        for (const [id, player] of this.state.players) {
            const participant = this.participants.get(id)
            if (participant) {
                participant.kills = player.kills
                participant.deaths = player.deaths
                participant.weaponTier = player.weaponTier
                if (player.team) participant.team = player.team
            }
        }
    }

    private finishMatch(
        winnerId: string,
        _winnerName: string,
        reason: 'time' | 'kills' | 'abandon' | 'interrupted' = 'kills',
        winningTeam?: TeamColor | 'draw',
    ) {
        if (this.state.phase !== 'playing') return
        this.snapshotPlayers()
        const resolvedPlayers = resolveResults([...this.participants.values()], reason, winnerId || undefined, {
            gameMode: this.state.gameMode,
            winningTeam,
            orangeScore: this.state.orangeScore,
            blueScore: this.state.blueScore,
        })
        const result = {
            id: this.matchId,
            startedAt: this.startedAt,
            endedAt: new Date().toISOString(),
            reason,
            players: resolvedPlayers,
        }
        const winners = result.players.filter((p) => p.outcome === 'win' || p.outcome === 'draw')
        this.clearCombatEntities()
        this.state.phase = 'finished'
        this.state.finishReason = reason
        void this.lock?.()?.catch?.(() => {})

        if (this.state.gameMode === 'tdm') {
            const wonTeam = result.players.find((p) => p.outcome === 'win')?.team
            const hasDraw = result.players.some((p) => p.outcome === 'draw')
            this.state.winnerId = wonTeam ? `team:${wonTeam}` : ''
            this.state.winnerName = wonTeam
                ? wonTeam === 'orange'
                    ? 'Equipo Naranja'
                    : 'Equipo Azul'
                : hasDraw
                  ? 'Equipo Naranja y Equipo Azul'
                  : ''
        } else {
            this.state.winnerId = winners.length === 1 ? winners[0].sessionId : ''
            this.state.winnerName = winners.map((p) => p.name).join(', ')
        }

        this.state.resultSummary = JSON.stringify(
            result.players.map(({ accountId: _accountId, ...p }) => p),
        )
        this.state.saveStatus = 'saving'
        this.syncMetadata()
        const id = this.matchId
        void (this.resultStore ?? getResultStore()).finish(result, (status) => {
            if (this.matchId === id) this.state.saveStatus = status
        })
    }

    private finishMatchByTime() {
        this.finishMatch('', '', 'time')
    }

    private isFriendly(attacker: Player | undefined, target: Player): boolean {
        return (
            this.state.gameMode === 'tdm' &&
            Boolean(attacker?.team) &&
            attacker?.team === target.team
        )
    }

    private performMeleeAttack(
        attackerId: string,
        attacker: Player,
        meleeWeapon: MeleeWeaponType,
        aimAngle: number,
        now: number,
    ) {
        const spec = this.weaponSpec(meleeWeapon)
        const rangePx = spec.rangePx ?? 58
        const halfArcRad = (((spec.arcDeg ?? 110) / 2) * Math.PI) / 180

        attacker.meleeAttackSeq += 1
        attacker.lastMeleeAngle = aimAngle

        for (const [targetId, target] of this.state.players) {
            if (targetId === attackerId || target.isDead || target.hp <= 0) continue
            if (this.isFriendly(attacker, target)) continue

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

            if (segmentBlockedByObstacle(attacker.x, attacker.y, target.x, target.y, this.arenaMap))
                continue

            if (this.applyDamageToPlayer(targetId, target, attackerId, spec.damage, now, meleeWeapon)) {
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
        usedWeapon?: WeaponType,
    ): boolean {
        const attacker = this.state.players.get(attackerId)
        if (this.isFriendly(attacker, target)) return false

        // Timed shield blocks all incoming damage without breaking; it only expires on timer end.
        if (target.shield > 0 && now < target.shieldUntil) {
            return false
        }

        target.hp = Math.max(0, target.hp - damage)

        if (target.hp <= 0) {
            target.hp = 0
            target.isDead = true
            target.respawnAt = now + RESPAWN_DELAY_MS
            target.deaths += 1
            this.clearBuffs(target)
            this.cancelReload(target)
            this.inputs.delete(targetId)

            if (attacker) {
                attacker.kills += 1

                if (this.state.gameMode === 'tdm') {
                    if (attacker.team === 'orange') {
                        this.state.orangeScore += 1
                        if (this.state.orangeScore >= this.state.killsToWin) {
                            this.finishMatch('', '', 'kills', 'orange')
                            return true
                        }
                    } else if (attacker.team === 'blue') {
                        this.state.blueScore += 1
                        if (this.state.blueScore >= this.state.killsToWin) {
                            this.finishMatch('', '', 'kills', 'blue')
                            return true
                        }
                    }
                } else if (this.state.gameMode === 'gungame') {
                    const expectedWeapon = GUN_GAME_LADDER[attacker.weaponTier] as WeaponType | undefined
                    const matchedLadder = !usedWeapon || usedWeapon === expectedWeapon
                    if (matchedLadder) {
                        attacker.weaponTier += 1
                        if (attacker.weaponTier >= GUN_GAME_LADDER.length) {
                            this.finishMatch(attacker.id, attacker.name, 'kills')
                            return true
                        }
                        const nextWeapon = GUN_GAME_LADDER[attacker.weaponTier] as WeaponType
                        this.equipWeapon(
                            attacker,
                            nextWeapon,
                            nextWeapon === 'axe' || nextWeapon === 'knife',
                        )
                    } else {
                        target.weaponTier = Math.max(0, target.weaponTier - 1)
                        if (
                            !this.isMeleeWeapon(attacker.weaponType) &&
                            attacker.ammo === 0 &&
                            attacker.reserveAmmo === 0
                        ) {
                            attacker.ammo = attacker.maxAmmo
                        }
                    }
                } else if (attacker.kills >= this.state.killsToWin) {
                    this.finishMatch(attacker.id, attacker.name, 'kills')
                    return true
                }
            }
        }
        return false
    }

    private detonateExplosion(
        x: number,
        y: number,
        radius: number,
        maxDamage: number,
        ownerId: string,
        weaponType: WeaponType,
        now: number,
    ): boolean {
        try {
            this.broadcast?.('explosion', { x: Math.round(x), y: Math.round(y), radius })
        } catch {
            // Isolated unit tests without an attached Colyseus transport.
        }

        const owner = this.state.players.get(ownerId)
        for (const [playerId, target] of this.state.players) {
            if (playerId === ownerId || target.isDead || target.hp <= 0) continue
            if (this.isFriendly(owner, target)) continue

            const dist = Math.hypot(target.x - x, target.y - y)
            if (dist > radius) continue
            if (
                dist > PLAYER_HIT_RADIUS &&
                segmentBlockedByObstacle(x, y, target.x, target.y, this.arenaMap)
            ) {
                continue
            }

            const damage = calculateExplosionDamage(dist, radius, maxDamage)
            if (damage <= 0) continue
            if (this.applyDamageToPlayer(playerId, target, ownerId, damage, now, weaponType)) {
                return true
            }
        }
        return false
    }

    private fireWeapon(ownerId: string, player: Player, aimAngle: number, now: number) {
        if (player.isReloading) return

        const hasGoldenAmmo = now < player.goldenUntil
        if (!hasGoldenAmmo && player.ammo <= 0) {
            return
        }

        const spec = this.weaponSpec(player.weaponType)
        player.lastShotAt = now
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
                spec.explosionRadius ?? 0,
                player.teamColor,
                now,
            )
        }

        if (!hasGoldenAmmo) {
            player.ammo = Math.max(0, player.ammo - 1)
        }
    }

    private spawnBullet(
        ownerId: string,
        player: Player,
        angle: number,
        speed: number,
        damage: number,
        scale: number,
        explosionRadius: number,
        teamColor: TeamColor,
        now: number,
    ) {
        const originX = player.x
        const originY = player.y + MUZZLE_OFFSET_Y
        const spawnX = originX + Math.cos(angle) * MUZZLE_OFFSET
        const spawnY = originY + Math.sin(angle) * MUZZLE_OFFSET

        if (
            segmentBlockedByObstacle(originX, originY, spawnX, spawnY, this.arenaMap) ||
            isBulletHittingObstacle(spawnX, spawnY, 4, this.arenaMap)
        ) {
            if (explosionRadius > 0) {
                this.detonateExplosion(originX, originY, explosionRadius, damage, ownerId, player.weaponType, now)
            }
            return
        }

        for (const [playerId, target] of this.state.players) {
            if (playerId === ownerId || target.isDead || target.hp <= 0) continue
            if (this.isFriendly(player, target)) continue

            if (
                segmentIntersectsPlayerHitbox(
                    originX,
                    originY,
                    spawnX,
                    spawnY,
                    target.x,
                    target.y,
                    PLAYER_HIT_RADIUS,
                )
            ) {
                if (explosionRadius > 0) {
                    this.detonateExplosion(target.x, target.y, explosionRadius, damage, ownerId, player.weaponType, now)
                } else {
                    this.applyDamageToPlayer(playerId, target, ownerId, damage, now, player.weaponType)
                }
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
        bullet.explosionRadius = explosionRadius
        bullet.scale = scale
        bullet.teamColor = teamColor

        this.state.bullets.set(bullet.id, bullet)
        this.bulletCreatedAt.set(bullet.id, now)
    }

    private collectOccupiedItemPoints() {
        const occupied: { x: number; y: number }[] = []
        for (const p of this.state.pickups.values()) occupied.push({ x: p.x, y: p.y })
        for (const pu of this.state.powerUps.values()) occupied.push({ x: pu.x, y: pu.y })
        for (const pl of this.state.players.values()) {
            if (!pl.isDead) occupied.push({ x: pl.x, y: pl.y })
        }
        return occupied
    }

    private shouldSpawnGolden(): boolean {
        if (this.goldenSpawned) return false
        if (this.state.timeRemaining <= GOLDEN_TIME_THRESHOLD_SECONDS) return true

        if (this.state.gameMode === 'tdm') {
            const threshold = Math.ceil(this.state.killsToWin * 0.75)
            return Math.max(this.state.orangeScore, this.state.blueScore) >= threshold
        }

        if (this.state.gameMode === 'gungame') {
            const threshold = Math.ceil(GUN_GAME_LADDER.length * 0.75)
            for (const player of this.state.players.values()) {
                if (player.weaponTier >= threshold) return true
            }
            return false
        }

        const threshold = Math.ceil(this.state.killsToWin * 0.75)
        for (const player of this.state.players.values()) {
            if (player.kills >= threshold) return true
        }
        return false
    }

    private spawnGoldenPowerUp(now: number) {
        if (this.goldenSpawned) return
        this.goldenSpawned = true
        const spot = pickRandomFreeArenaPoint(this.arenaMap, this.collectOccupiedItemPoints(), {
            clearance: 34,
            minSpacing: 72,
            fallbacks: [this.arenaMap.goldenSpawnPoint, ...this.arenaMap.powerUpSpawnPoints],
        })

        const powerUp = new PowerUpState()
        powerUp.id = `pu-${++this.nextPowerUpId}`
        powerUp.kind = 'golden'
        powerUp.x = spot.x
        powerUp.y = spot.y
        this.state.powerUps.set(powerUp.id, powerUp)
        this.setAnnouncement('¡Power-Up Dorado disponible en la arena!', 5000, now)
    }

    private spawnPowerUp() {
        const existing = Array.from(this.state.powerUps.values())
        const normalActive = existing.filter((p) => p.kind !== 'golden')
        const maxActive = maxActiveItemsForPlayers(
            this.state.players.size,
            this.state.mapSize,
            'powerup',
        )
        if (normalActive.length >= maxActive) return

        const spot = pickRandomFreeArenaPoint(this.arenaMap, this.collectOccupiedItemPoints(), {
            clearance: 30,
            minSpacing: 72,
            fallbacks: this.arenaMap.powerUpSpawnPoints,
        })

        const activeKinds = new Set(normalActive.map((p) => p.kind))
        const preferredKinds = NORMAL_POWERUPS.filter((k) => !activeKinds.has(k))
        const pool = preferredKinds.length > 0 ? preferredKinds : NORMAL_POWERUPS
        const kind = pool[Math.floor(Math.random() * pool.length)]

        const powerUp = new PowerUpState()
        powerUp.id = `pu-${++this.nextPowerUpId}`
        powerUp.kind = kind
        powerUp.x = spot.x
        powerUp.y = spot.y
        this.state.powerUps.set(powerUp.id, powerUp)
    }

    private activateShield(player: Player, durationMs: number, now: number) {
        const nextUntil = Math.max(player.shieldUntil, now + durationMs)
        const remainingMs = Math.max(1, nextUntil - now)
        player.shield = 100
        player.shieldUntil = nextUntil
        player.shieldDurationMs = Math.max(durationMs, remainingMs)
        player.shieldRemaining = Math.max(1, Math.ceil(remainingMs / 1000))
        player.shieldProgress = Math.max(0, Math.min(1, remainingMs / player.shieldDurationMs))
    }

    private applyPowerUp(sessionId: string, player: Player, kind: PowerUpKind, now: number): boolean {
        if (kind === 'ammo') {
            const spec = this.weaponSpec(player.weaponType)
            if (spec.isMelee || player.maxAmmo <= 0) return false
            const maxReserve = player.maxAmmo * MAX_RESERVE_MAGAZINES
            if (player.ammo >= player.maxAmmo && player.reserveAmmo >= maxReserve) return false

            if (player.ammo === 0 && !player.isReloading) {
                player.ammo = player.maxAmmo
            } else {
                player.reserveAmmo = Math.min(maxReserve, player.reserveAmmo + player.maxAmmo)
            }
            return true
        }

        if (kind === 'medkit') {
            if (player.hp >= 100) return false
            player.hp = Math.min(100, player.hp + MEDKIT_HEAL_AMOUNT)
            return true
        }

        if (kind === 'shield') {
            this.activateShield(player, SHIELD_DURATION_MS, now)
            return true
        }

        if (kind === 'dash') {
            player.dashes = Math.min(MAX_DASHES, player.dashes + 1)
            if (player.dashes >= MAX_DASHES) {
                player.dashRechargeStartAt = 0
                player.dashRechargeProgress = 0
            }
            const accountId = this.accounts.get(sessionId)?.accountId
            if (accountId) this.dashesByAccount.set(accountId, player.dashes)
            return true
        }

        // Golden Power-Up: heal to 100, unbreakable shield + infinite ammo for 15s.
        player.hp = 100
        this.activateShield(player, GOLDEN_DURATION_MS, now)
        player.goldenUntil = now + GOLDEN_DURATION_MS
        player.goldenRemaining = Math.ceil(GOLDEN_DURATION_MS / 1000)
        if (!this.isMeleeWeapon(player.weaponType) && player.maxAmmo > 0) {
            this.cancelReload(player)
            player.ammo = player.maxAmmo
        }
        this.setAnnouncement(`¡${player.name} obtuvo el Power-Up Dorado!`, 4200, now)
        return true
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
            this.nextPowerUpAt += deltaMs
            if (this.announcementUntil > 0) this.announcementUntil += deltaMs
            for (const [bulletId, createdAt] of this.bulletCreatedAt) {
                this.bulletCreatedAt.set(bulletId, createdAt + deltaMs)
            }
            for (const player of this.state.players.values()) {
                if (player.isDead && player.respawnAt > 0) player.respawnAt += deltaMs
                if (player.isReloading && player.reloadCompleteAt > 0) player.reloadCompleteAt += deltaMs
                if (player.shieldUntil > 0) player.shieldUntil += deltaMs
                if (player.goldenUntil > 0) player.goldenUntil += deltaMs
                if (player.dashUntil > 0) player.dashUntil += deltaMs
                if (player.dashCooldownUntil > 0) player.dashCooldownUntil += deltaMs
                if (player.dashRechargeStartAt > 0) player.dashRechargeStartAt += deltaMs
            }
            return
        }

        const now = performance.now()
        const dt = deltaMs / 1000

        if (this.state.announcement && this.announcementUntil > 0 && now >= this.announcementUntil) {
            this.setAnnouncement('')
        }

        // Update player movement (dash takes priority over normal walk).
        for (const [id, player] of this.state.players) {
            if (player.isDead) continue

            if (now < player.dashUntil) {
                const dashDist = DASH_SPEED * dt
                const next = moveInsideArena(
                    player,
                    player.dashDirX * dashDist,
                    player.dashDirY * dashDist,
                    this.arenaMap,
                )
                player.x = next.x
                player.y = next.y
                continue
            }

            const input = this.inputs.get(id)
            if (!input) continue
            if (now - input.receivedAt >= INPUT_TIMEOUT_MS) {
                this.inputs.delete(id)
                continue
            }

            const length = Math.hypot(input.moveX, input.moveY)
            if (length === 0) continue

            const scale = length > 1 ? 1 / length : 1
            const distance = SPEED * dt
            const next = moveInsideArena(
                player,
                input.moveX * scale * distance,
                input.moveY * scale * distance,
                this.arenaMap,
            )

            player.x = next.x
            player.y = next.y
        }

        if (this.state.phase !== 'playing') return

        // Update reload, shield durability, golden, and dash recharge timers.
        for (const [sessionId, player] of this.state.players) {
            // Dash recharges 1 charge every 10 seconds up to MAX_DASHES.
            if (player.dashes < MAX_DASHES) {
                if (player.dashRechargeStartAt === 0) {
                    player.dashRechargeStartAt = now
                }
                const elapsed = now - player.dashRechargeStartAt
                if (elapsed >= DASH_RECHARGE_MS) {
                    const gained = Math.floor(elapsed / DASH_RECHARGE_MS)
                    player.dashes = Math.min(MAX_DASHES, player.dashes + gained)
                    const accountId = this.accounts.get(sessionId)?.accountId
                    if (accountId) this.dashesByAccount.set(accountId, player.dashes)
                    if (player.dashes >= MAX_DASHES) {
                        player.dashRechargeStartAt = 0
                        player.dashRechargeProgress = 0
                    } else {
                        player.dashRechargeStartAt += gained * DASH_RECHARGE_MS
                        player.dashRechargeProgress = Math.max(
                            0,
                            Math.min(1, (now - player.dashRechargeStartAt) / DASH_RECHARGE_MS),
                        )
                    }
                } else {
                    player.dashRechargeProgress = Math.max(0, Math.min(1, elapsed / DASH_RECHARGE_MS))
                }
            } else {
                player.dashRechargeStartAt = 0
                player.dashRechargeProgress = 0
            }

            if (player.isDead) continue

            if (player.isReloading) {
                if (now >= player.reloadCompleteAt) {
                    const needed = Math.max(0, player.maxAmmo - player.ammo)
                    const taken = Math.min(needed, player.reserveAmmo)
                    player.ammo += taken
                    player.reserveAmmo -= taken
                    this.cancelReload(player)
                } else {
                    const elapsed = player.reloadDurationMs - (player.reloadCompleteAt - now)
                    player.reloadProgress = Math.max(
                        0,
                        Math.min(1, elapsed / Math.max(1, player.reloadDurationMs)),
                    )
                }
            }

            if (player.shieldUntil > 0) {
                if (now >= player.shieldUntil) {
                    player.shield = 0
                    player.shieldUntil = 0
                    player.shieldDurationMs = 0
                    player.shieldRemaining = 0
                    player.shieldProgress = 0
                } else {
                    const remainingMs = player.shieldUntil - now
                    player.shieldRemaining = Math.max(1, Math.ceil(remainingMs / 1000))
                    player.shieldProgress = Math.max(
                        0,
                        Math.min(1, remainingMs / Math.max(1, player.shieldDurationMs)),
                    )
                }
            }

            if (player.goldenUntil > 0) {
                if (now >= player.goldenUntil) {
                    player.goldenUntil = 0
                    player.goldenRemaining = 0
                } else {
                    player.goldenRemaining = Math.max(1, Math.ceil((player.goldenUntil - now) / 1000))
                }
            }
        }

        this.state.timeRemaining = Math.max(0, this.state.timeRemaining - dt)

        for (const [bulletId, bullet] of this.state.bullets) {
            const prevX = bullet.x
            const prevY = bullet.y
            bullet.x += bullet.vx * dt
            bullet.y += bullet.vy * dt

            const createdAt = this.bulletCreatedAt.get(bulletId) ?? now
            const outOfBounds =
                bullet.x < 0 ||
                bullet.x > this.arenaMap.width ||
                bullet.y < 0 ||
                bullet.y > this.arenaMap.height
            const expired = now - createdAt >= BULLET_LIFETIME_MS
            const hitWall =
                isBulletHittingObstacle(bullet.x, bullet.y, 4, this.arenaMap) ||
                segmentBlockedByObstacle(prevX, prevY, bullet.x, bullet.y, this.arenaMap)

            if (outOfBounds || expired || hitWall) {
                this.state.bullets.delete(bulletId)
                this.bulletCreatedAt.delete(bulletId)
                if (bullet.explosionRadius > 0) {
                    const blastX = hitWall || outOfBounds ? prevX : bullet.x
                    const blastY = hitWall || outOfBounds ? prevY : bullet.y
                    if (
                        this.detonateExplosion(
                            blastX,
                            blastY,
                            bullet.explosionRadius,
                            bullet.damage,
                            bullet.ownerId,
                            bullet.weaponType,
                            now,
                        )
                    ) {
                        return
                    }
                }
                continue
            }

            const owner = this.state.players.get(bullet.ownerId)
            for (const [playerId, target] of this.state.players) {
                if (playerId === bullet.ownerId || target.isDead || target.hp <= 0) continue
                if (this.isFriendly(owner, target)) continue

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

                    if (bullet.explosionRadius > 0) {
                        if (
                            this.detonateExplosion(
                                target.x,
                                target.y,
                                bullet.explosionRadius,
                                bullet.damage,
                                bullet.ownerId,
                                bullet.weaponType,
                                now,
                            )
                        ) {
                            return
                        }
                    } else if (
                        this.applyDamageToPlayer(
                            playerId,
                            target,
                            bullet.ownerId,
                            bullet.damage,
                            now,
                            bullet.weaponType,
                        )
                    ) {
                        return
                    }
                    break
                }
            }
        }

        const activePlayerCount = this.state.players.size

        // Weapon pickups (disabled in Gun Game).
        if (this.state.gameMode !== 'gungame') {
            if (now >= this.nextPickupAt) {
                this.nextPickupAt =
                    now + scaledSpawnIntervalMs(this.arenaMap.pickupIntervalMs, activePlayerCount)
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
        }

        // Power-Ups (enabled in all modes) + one-time Golden Power-Up near match end.
        if (now >= this.nextPowerUpAt) {
            this.nextPowerUpAt =
                now + scaledSpawnIntervalMs(this.arenaMap.powerUpIntervalMs, activePlayerCount)
            this.spawnPowerUp()
        }

        if (this.shouldSpawnGolden()) {
            this.spawnGoldenPowerUp(now)
        }

        for (const [powerUpId, powerUp] of this.state.powerUps) {
            for (const [sessionId, player] of this.state.players) {
                if (player.isDead) continue
                const dist = Math.hypot(player.x - powerUp.x, player.y - powerUp.y)
                if (dist <= weaponsConfig.pickupRadius) {
                    if (this.applyPowerUp(sessionId, player, powerUp.kind, now)) {
                        this.state.powerUps.delete(powerUpId)
                        break
                    }
                }
            }
        }

        for (const [playerId, player] of this.state.players) {
            if (!player.isDead || now < player.respawnAt) continue

            const spawn = this.selectSafestSpawnPoint(playerId)
            player.x = spawn.x
            player.y = spawn.y
            player.hp = 100
            this.clearBuffs(player)
            this.resetPlayerLoadout(player)
            player.isDead = false
            player.respawnAt = 0
        }

        if (this.state.timeRemaining <= 0) {
            this.finishMatchByTime()
        }
    }

    private spawnWeaponPickup() {
        const maxActive = maxActiveItemsForPlayers(
            this.state.players.size,
            this.state.mapSize,
            'weapon',
        )
        if (this.state.pickups.size >= maxActive) return

        const spot = pickRandomFreeArenaPoint(this.arenaMap, this.collectOccupiedItemPoints(), {
            clearance: 30,
            minSpacing: 72,
            fallbacks: this.arenaMap.pickupSpawnPoints,
        })
        const weaponType = PICKUP_WEAPONS[Math.floor(Math.random() * PICKUP_WEAPONS.length)]

        const pickup = new WeaponPickup()
        pickup.id = `pk-${++this.nextPickupId}`
        pickup.weaponType = weaponType
        pickup.x = spot.x
        pickup.y = spot.y
        this.state.pickups.set(pickup.id, pickup)
    }

    private selectSafestSpawnPoint(
        respawningPlayerId: string,
        candidatePlayer?: Player,
    ): { x: number; y: number } {
        const respawningPlayer = candidatePlayer ?? this.state.players.get(respawningPlayerId)
        const livingRivals = Array.from(this.state.players.values()).filter(
            (other) =>
                other.id !== respawningPlayerId &&
                !other.isDead &&
                !this.isFriendly(respawningPlayer, other),
        )

        if (livingRivals.length === 0) {
            return this.arenaMap.spawnPoints[0]
        }

        let bestSpawn = this.arenaMap.spawnPoints[0]
        let bestMinDist = -1

        for (const candidate of this.arenaMap.spawnPoints) {
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

    async onAuth(
        _client: Client,
        options?: { accessToken?: unknown; skin?: unknown; weapon?: unknown },
    ) {
        let account: VerifiedAccount
        try {
            account = await verifyArenaAccount(options?.accessToken)
        } catch (error) {
            const message =
                error instanceof Error &&
                [
                    'Inicia sesión antes de entrar a la arena.',
                    'La sesión no es válida. Vuelve a iniciar sesión.',
                    'La sesión venció. Vuelve a iniciar sesión.',
                    'No se pudo verificar tu perfil. Inténtalo de nuevo.',
                    'Elige un username válido en tu perfil antes de jugar.',
                ].includes(error.message)
                    ? error.message
                    : 'No se pudo verificar tu cuenta. Inténtalo de nuevo.'
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
        if (this.state.phase === 'finished' || this.starting) {
            throw new ServerError(400, 'La partida ya terminó; espera la siguiente ronda.')
        }
        if (this.state.players.size >= this.maxClients) {
            throw new ServerError(400, 'La sala está llena.')
        }
        if ([...this.accounts.values()].some((a) => a.accountId === auth.accountId)) {
            throw new ServerError(400, 'Esta cuenta ya ocupa una plaza.')
        }

        let returningParticipant: Participant | undefined
        let returningOldSessionId: string | undefined
        if (this.state.phase === 'playing') {
            for (const [sid, participant] of this.participants) {
                if (participant.accountId === auth.accountId) {
                    returningParticipant = participant
                    returningOldSessionId = sid
                    break
                }
            }
            if (!returningParticipant && this.participants.size >= MAX_MATCH_PARTICIPANTS) {
                throw new ServerError(400, 'La partida alcanzó el límite de participantes.')
            }
        }

        const player = new Player()
        player.id = client.sessionId
        player.name = auth.name
        player.skin = auth.skin
        player.startingWeapon = auth.weapon

        if (this.state.gameMode === 'tdm') {
            const assignedTeam =
                returningParticipant?.team ?? this.assignTeamForPlayer(auth.teamColor)
            player.team = assignedTeam
            player.teamColor = assignedTeam
        } else {
            player.team = ''
            player.teamColor = auth.teamColor
        }

        if (this.state.phase === 'playing') {
            const now = performance.now()
            if (returningParticipant && returningOldSessionId) {
                this.participants.delete(returningOldSessionId)
                returningParticipant.sessionId = client.sessionId
                returningParticipant.name = auth.name
                returningParticipant.abandoned = false
                if (player.team) returningParticipant.team = player.team
                this.participants.set(client.sessionId, returningParticipant)
                player.kills = returningParticipant.kills
                player.deaths = returningParticipant.deaths
                player.weaponTier = returningParticipant.weaponTier ?? 0
                player.dashes = this.dashesByAccount.get(auth.accountId) ?? MAX_DASHES
                if (player.dashes < MAX_DASHES) player.dashRechargeStartAt = now
            } else {
                const newParticipant: Participant = {
                    sessionId: client.sessionId,
                    accountId: auth.accountId,
                    name: auth.name,
                    kills: 0,
                    deaths: 0,
                    abandoned: false,
                    team: player.team || undefined,
                    weaponTier: 0,
                }
                this.participants.set(client.sessionId, newParticipant)
                player.dashes = this.dashesByAccount.get(auth.accountId) ?? MAX_DASHES
                this.dashesByAccount.set(auth.accountId, player.dashes)
                if (player.dashes < MAX_DASHES) player.dashRechargeStartAt = now
                if (this.matchId && this.startedAt) {
                    try {
                        void (this.resultStore ?? getResultStore())
                            .begin(this.matchId, this.startedAt, [...this.participants.values()])
                            .catch(() => {})
                    } catch {
                        // Ignore when running without configured resultStore in isolated unit tests.
                    }
                }
            }

            // Immediately tighten upcoming spawn timers when more players join.
            const nextCount = this.state.players.size + 1
            const nextPickupLimit = now + scaledSpawnIntervalMs(this.arenaMap.pickupIntervalMs, nextCount)
            const nextPowerUpLimit = now + scaledSpawnIntervalMs(this.arenaMap.powerUpIntervalMs, nextCount)
            if (this.nextPickupAt > nextPickupLimit) this.nextPickupAt = nextPickupLimit
            if (this.nextPowerUpAt > nextPowerUpLimit) this.nextPowerUpAt = nextPowerUpLimit
        } else {
            player.dashes = MAX_DASHES
        }

        player.maxDashes = MAX_DASHES
        this.resetPlayerLoadout(player)

        const players = Array.from(this.state.players.values())
        const spawn =
            this.state.phase === 'playing'
                ? this.selectSafestSpawnPoint(client.sessionId, player)
                : (this.arenaMap.spawnPoints.find(({ x, y }) =>
                      players.every((p) => p.x !== x || p.y !== y),
                  ) ?? this.selectSafestSpawnPoint(client.sessionId, player))

        player.x = spawn.x
        player.y = spawn.y

        this.state.players.set(player.id, player)
        this.trackAccount(client, auth)

        if (!this.state.hostId) this.state.hostId = client.sessionId
        this.syncMetadata()
    }

    onLeave(client: Client) {
        this.snapshotPlayers()
        const participant = this.participants.get(client.sessionId)
        if (participant && this.state.phase === 'playing') participant.abandoned = true
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

        if (this.state.hostId === client.sessionId) {
            this.state.hostId = this.state.players.keys().next().value ?? ''
        }

        if (this.state.phase === 'playing') {
            if (this.state.gameMode === 'tdm') {
                const remainingPlayers = Array.from(this.state.players.values())
                const orangeRemaining = remainingPlayers.some((p) => p.team === 'orange')
                const blueRemaining = remainingPlayers.some((p) => p.team === 'blue')
                if (remainingPlayers.length === 0) {
                    this.finishMatch('', '', 'interrupted')
                } else if (!orangeRemaining || !blueRemaining) {
                    const winnerTeam: TeamColor = orangeRemaining ? 'orange' : 'blue'
                    this.finishMatch('', '', 'abandon', winnerTeam)
                }
            } else if (this.state.players.size < 2) {
                const remaining = this.state.players.values().next().value
                this.finishMatch(
                    remaining?.id ?? '',
                    remaining?.name ?? '',
                    remaining ? 'abandon' : 'interrupted',
                )
            }
        }

        if (this.state.players.size === 0) this.resetToWaiting()
        else this.syncMetadata()
    }
}

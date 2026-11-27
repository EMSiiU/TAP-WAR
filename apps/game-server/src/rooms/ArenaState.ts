import { MapSchema, Schema, type, view } from '@colyseus/schema'
import type { MapSize } from './ArenaMaps.js'
import type { GameMode, PowerUpKind, TeamId } from '../../../../packages/shared/gameplay.js'

export type MatchPhase = 'waiting' | 'playing' | 'finished'
export type PlayerSkin = 'fox' | 'squirrel' | 'mouse' | 'rabbit'
export type TeamColor = TeamId
export type MeleeWeaponType = 'knife' | 'axe'
export type WeaponType =
    | 'pistol'
    | 'revolver'
    | 'smg'
    | 'sniper'
    | 'launcher'
    | 'rifle'
    | 'plasma'
    | 'shotgun'
    | 'knife'
    | 'axe'

export class Player extends Schema {
    @type('string') id = ''
    @type('float32') x = 0
    @type('float32') y = 0
    @type('float32') aimAngle = 0
    @type('string') name = ''
    @type('string') skin: PlayerSkin = 'fox'
    @type('string') teamColor: TeamColor = 'orange'
    @type('string') team: TeamColor | '' = ''
    @type('string') startingWeapon: WeaponType = 'rifle'
    @type('string') weaponType: WeaponType = 'rifle'
    @type('uint16') ammo = 15
    @type('uint16') maxAmmo = 15
    @type('uint16') reserveAmmo = 15
    @type('boolean') isReloading = false
    @type('float32') reloadProgress = 0
    @type('string') lastMeleeWeapon: MeleeWeaponType = 'knife'
    @type('uint8') hp = 100
    @type('uint8') shield = 0
    @type('uint8') shieldRemaining = 0
    @type('float32') shieldProgress = 0
    @type('uint8') goldenRemaining = 0
    @type('uint8') dashes = 5
    @type('uint8') maxDashes = 5
    @type('float32') dashRechargeProgress = 0
    @type('uint16') dashSeq = 0
    @type('float32') dashAngle = 0
    @type('uint8') weaponTier = 0
    @type('uint16') kills = 0
    @type('uint16') deaths = 0
    @type('boolean') isDead = false
    @type('boolean') isBot = false
    @type('string') emote = ''
    @type('uint16') meleeAttackSeq = 0
    @type('float32') lastMeleeAngle = 0
    @view() @type('uint32') lastInputSeq = 0

    lastShotAt = -1000
    lastMeleeAt = -1000
    respawnAt = 0
    emoteUntil = 0
    reloadCompleteAt = 0
    reloadDurationMs = 0
    shieldUntil = 0
    shieldDurationMs = 0
    goldenUntil = 0
    dashUntil = 0
    dashCooldownUntil = 0
    dashRechargeStartAt = 0
    dashDirX = 0
    dashDirY = 0
}

export class BulletState extends Schema {
    @type('string') id = ''
    @type('string') ownerId = ''
    @type('float32') x = 0
    @type('float32') y = 0
    @type('int16') vx = 0
    @type('int16') vy = 0
    @type('float32') angle = 0
    @type('string') weaponType: WeaponType = 'rifle'
    @type('string') teamColor: TeamColor = 'orange'
    @type('float32') scale = 1

    damage = 25
    explosionRadius = 0
    simX = 0
    simY = 0
}

export class WeaponPickup extends Schema {
    @type('string') id = ''
    @type('string') weaponType: WeaponType = 'shotgun'
    @type('int16') x = 0
    @type('int16') y = 0
}

export class PowerUpState extends Schema {
    @type('string') id = ''
    @type('string') kind: PowerUpKind = 'medkit'
    @type('int16') x = 0
    @type('int16') y = 0
}

export class ArenaState extends Schema {
    @type('string') roomCode = ''
    @type('string') roomName = ''
    @type('string') environment = 'desert'
    @type('string') gameMode: GameMode = 'ffa'
    @type('string') mapSize: MapSize = 'small'
    @type('uint8') maxPlayers = 4
    @type('boolean') isPrivate = false
    @type('string') hostId = ''
    @type('string') notice = ''
    @type('string') announcement = ''
    @type('string') saveStatus = ''
    @type('string') resultSummary = ''
    @type('string') finishReason = ''
    @type('string') phase: MatchPhase = 'waiting'
    @type('boolean') isPaused = false
    @type('string') pausedByName = ''
    @type('uint16') timeRemaining = 300
    @type('uint16') killsToWin = 20
    @type('uint16') orangeScore = 0
    @type('uint16') blueScore = 0
    @type('string') winnerId = ''
    @type('string') winnerName = ''
    @type({ map: Player }) players = new MapSchema<Player>()
    @view() @type({ map: BulletState }) bullets = new MapSchema<BulletState>()
    @type({ map: WeaponPickup }) pickups = new MapSchema<WeaponPickup>()
    @type({ map: PowerUpState }) powerUps = new MapSchema<PowerUpState>()
}

import { MapSchema, Schema, type } from '@colyseus/schema'
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
    @type('number') x = 0
    @type('number') y = 0
    @type('number') aimAngle = 0
    @type('string') name = ''
    @type('string') skin: PlayerSkin = 'fox'
    @type('string') teamColor: TeamColor = 'orange'
    @type('string') team: TeamColor | '' = ''
    @type('string') startingWeapon: WeaponType = 'rifle'
    @type('string') weaponType: WeaponType = 'rifle'
    @type('number') ammo = 15
    @type('number') maxAmmo = 15
    @type('number') reserveAmmo = 15
    @type('boolean') isReloading = false
    @type('number') reloadProgress = 0
    @type('string') lastMeleeWeapon: MeleeWeaponType = 'knife'
    @type('number') hp = 100
    @type('number') shield = 0
    @type('number') shieldRemaining = 0
    @type('number') shieldProgress = 0
    @type('number') goldenRemaining = 0
    @type('number') dashes = 5
    @type('number') maxDashes = 5
    @type('number') dashRechargeProgress = 0
    @type('number') dashSeq = 0
    @type('number') dashAngle = 0
    @type('number') weaponTier = 0
    @type('number') kills = 0
    @type('number') deaths = 0
    @type('boolean') isDead = false
    @type('string') emote = ''
    @type('number') meleeAttackSeq = 0
    @type('number') lastMeleeAngle = 0

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
    @type('number') x = 0
    @type('number') y = 0
    @type('number') vx = 0
    @type('number') vy = 0
    @type('number') angle = 0
    @type('string') weaponType: WeaponType = 'rifle'
    @type('string') teamColor: TeamColor = 'orange'
    @type('number') scale = 1

    damage = 25
    explosionRadius = 0
}

export class WeaponPickup extends Schema {
    @type('string') id = ''
    @type('string') weaponType: WeaponType = 'shotgun'
    @type('number') x = 0
    @type('number') y = 0
}

export class PowerUpState extends Schema {
    @type('string') id = ''
    @type('string') kind: PowerUpKind = 'medkit'
    @type('number') x = 0
    @type('number') y = 0
}

export class ArenaState extends Schema {
    @type('string') roomCode = ''
    @type('string') roomName = ''
    @type('string') environment = 'desert'
    @type('string') gameMode: GameMode = 'ffa'
    @type('string') mapSize: MapSize = 'small'
    @type('number') maxPlayers = 4
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
    @type('number') timeRemaining = 300
    @type('number') killsToWin = 20
    @type('number') orangeScore = 0
    @type('number') blueScore = 0
    @type('string') winnerId = ''
    @type('string') winnerName = ''
    @type({ map: Player }) players = new MapSchema<Player>()
    @type({ map: BulletState }) bullets = new MapSchema<BulletState>()
    @type({ map: WeaponPickup }) pickups = new MapSchema<WeaponPickup>()
    @type({ map: PowerUpState }) powerUps = new MapSchema<PowerUpState>()
}

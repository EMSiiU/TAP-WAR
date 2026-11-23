import { MapSchema, Schema, type } from '@colyseus/schema'

export type MatchPhase = 'waiting' | 'playing' | 'finished'
export type PlayerSkin = 'fox' | 'squirrel' | 'mouse' | 'rabbit'
export type TeamColor = 'orange' | 'blue'
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
    @type('string') startingWeapon: WeaponType = 'rifle'
    @type('string') weaponType: WeaponType = 'rifle'
    @type('number') ammo = 15
    @type('number') maxAmmo = 15
    @type('string') lastMeleeWeapon: MeleeWeaponType = 'knife'
    @type('number') hp = 100
    @type('number') kills = 0
    @type('number') deaths = 0
    @type('boolean') isDead = false
    @type('string') emote = ''
    @type('number') meleeAttackSeq = 0
    @type('number') lastMeleeAngle = 0

    lastShotAt = -1000
    respawnAt = 0
    emoteUntil = 0
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
}

export class WeaponPickup extends Schema {
    @type('string') id = ''
    @type('string') weaponType: WeaponType = 'shotgun'
    @type('number') x = 0
    @type('number') y = 0
}

export class ArenaState extends Schema {
    @type('string') hostId = ''
    @type('string') notice = ''
    @type('string') saveStatus = ''
    @type('string') resultSummary = ''
    @type('string') finishReason = ''
    @type('string') phase: MatchPhase = 'waiting'
    @type('boolean') isPaused = false
    @type('string') pausedByName = ''
    @type('number') timeRemaining = 300
    @type('number') killsToWin = 20
    @type('string') winnerId = ''
    @type('string') winnerName = ''
    @type({ map: Player }) players = new MapSchema<Player>()
    @type({ map: BulletState }) bullets = new MapSchema<BulletState>()
    @type({ map: WeaponPickup }) pickups = new MapSchema<WeaponPickup>()
}
import { MapSchema, Schema, type } from '@colyseus/schema'

export class Player extends Schema {
    @type('string') id = ''
    @type('number') x = 0
    @type('number') y = 0
    @type('number') aimAngle = 0
    @type('string') name = ''
    @type('number') hp = 100
    @type('number') kills = 0
    @type('number') deaths = 0
    @type('boolean') isDead = false

    lastShotAt = -300
    respawnAt = 0
}

export class BulletState extends Schema {
    @type('string') id = ''
    @type('string') ownerId = ''
    @type('number') x = 0
    @type('number') y = 0
    @type('number') vx = 0
    @type('number') vy = 0
    @type('number') angle = 0
}

export type MatchPhase = 'waiting' | 'playing' | 'finished'

export class ArenaState extends Schema {
    @type('string') phase: MatchPhase = 'waiting'
    @type('number') timeRemaining = 180
    @type('number') killsToWin = 10
    @type('string') winnerId = ''
    @type('string') winnerName = ''
    @type({ map: Player }) players = new MapSchema<Player>()
    @type({ map: BulletState }) bullets = new MapSchema<BulletState>()
}
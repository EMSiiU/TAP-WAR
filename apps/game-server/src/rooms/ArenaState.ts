import { MapSchema, Schema, type } from '@colyseus/schema'

export class Player extends Schema {
    @type('string') id = ''
    @type('number') x = 0
    @type('number') y = 0
    @type('number') aimAngle = 0
    @type('string') name = ''

    lastShotAt = 0
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

export class ArenaState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>()
    @type({ map: BulletState }) bullets = new MapSchema<BulletState>()
}
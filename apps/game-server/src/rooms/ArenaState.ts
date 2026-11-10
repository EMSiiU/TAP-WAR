import { MapSchema, Schema, type } from '@colyseus/schema'

export class Player extends Schema {
    @type('string') id = ''
    @type('number') x = 0
    @type('number') y = 0
    @type('number') aimAngle = 0
}

export class ArenaState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>()
}
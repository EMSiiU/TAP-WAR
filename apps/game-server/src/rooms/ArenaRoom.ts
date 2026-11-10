import { Room, type Client } from 'colyseus'
import { ArenaState, Player } from './ArenaState.js'

const SPAWN_POINTS = [
    { x: 240, y: 160 },
    { x: 784, y: 160 },
    { x: 240, y: 608 },
    { x: 784, y: 608 },
]

export class ArenaRoom extends Room {
    maxClients = SPAWN_POINTS.length
    autoDispose = false
    state = new ArenaState()

    onCreate() {
        this.roomId = 'arena-local'
    }

    onJoin(client: Client) {
        const players = Array.from(this.state.players.values())
        const spawn = SPAWN_POINTS.find(({ x, y }) =>
        players.every((player) => player.x !== x || player.y !== y),
        )

        if (!spawn) {
        throw new Error('No hay un punto de aparición disponible')
        }

        const player = new Player()
        player.id = client.sessionId
        player.x = spawn.x
        player.y = spawn.y

        this.state.players.set(player.id, player)
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId)
    }
}
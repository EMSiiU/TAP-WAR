import { Room, type Client } from 'colyseus'
import { ArenaState, Player } from './ArenaState.js'
import { parseArenaInput, type ArenaInput } from './ArenaInput.js'
import arena from '../../../../packages/shared/arena.json' with { type: 'json' }
import { moveInsideArena } from './ArenaCollision.js'

const STEP_MS = 1000 / 30
const INPUT_TIMEOUT_MS = 300
const SPEED = 220

export class ArenaRoom extends Room {
    maxClients = arena.spawnPoints.length
    autoDispose = false
    state = new ArenaState()

    patchRate = 50
    private inputs = new Map<string, ArenaInput & { receivedAt: number }>()

    onCreate() {
        this.roomId = 'arena-local'

        this.onMessage<unknown>('input', (client, message) => {
            const input = parseArenaInput(message)
            const player = this.state.players.get(client.sessionId)
            if (!input || !player) return

            this.inputs.set(client.sessionId, {
                ...input,
                receivedAt: performance.now(),
            })
            player.aimAngle = input.aimAngle
        })

        this.setSimulationInterval((deltaMs) => this.simulate(deltaMs), STEP_MS)
    }

    private simulate(deltaMs: number) {
        const now = performance.now()

        for (const [id, input] of this.inputs) {
            if (now - input.receivedAt >= INPUT_TIMEOUT_MS) {
                this.inputs.delete(id)
                continue
            }

            const player = this.state.players.get(id)
            if (!player) continue

            const length = Math.hypot(input.moveX, input.moveY)
            if (length === 0) continue

            const distance = SPEED * deltaMs / 1000
            const next = moveInsideArena(
                player,
                (input.moveX / length) * distance,
                (input.moveY / length) * distance,
            )

            player.x = next.x
            player.y = next.y
        }
    }

    onJoin(client: Client) {
        const players = Array.from(this.state.players.values())
        const spawn = arena.spawnPoints.find(({ x, y }) =>
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
        this.inputs.delete(client.sessionId)
        this.state.players.delete(client.sessionId)
    }
}
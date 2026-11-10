// Escena que dibuja dos jugadores de prueba
import Phaser from 'phaser'

type PlayerState = {
    id: string
    x: number
    y: number
    aimAngle: number
}

type PlayerView = {
    root: Phaser.GameObjects.Container
    aim: Phaser.GameObjects.Graphics
}

export default class ArenaScene extends Phaser.Scene {
    private playerViews = new Map<string, PlayerView>()

    constructor() {
        super('arena')
    }

    create() {
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.playerViews.clear()
        })

        // Primer estado simulado: dos jugadores entran a la sala
        this.applyPlayers([
        { id: 'p1', x: 240, y: 160, aimAngle: 0 },
        { id: 'p2', x: 600, y: 420, aimAngle: Math.PI / 2 },
        ])

        // Un seg después simulamos otra actualización del servidor
        this.time.delayedCall(1000, () => {
        this.applyPlayers([
            { id: 'p1', x: 380, y: 240, aimAngle: 0 },
            { id: 'p2', x: 600, y: 420, aimAngle: -Math.PI / 2 },
        ])
        })
    }

    private applyPlayers(players: PlayerState[]) {
        const activeIds = new Set(players.map((player) => player.id))

        for (const [id, view] of this.playerViews) {
        if (!activeIds.has(id)) {
            view.root.destroy()
            this.playerViews.delete(id)
        }
        }

        for (const player of players) {
        let view = this.playerViews.get(player.id)

        if (!view) {
            view = this.createPlayerView(player.id)
            this.playerViews.set(player.id, view)
        }

        view.root.setPosition(player.x, player.y)
        view.aim.setRotation(player.aimAngle)
        }
    }

    private createPlayerView(id: string): PlayerView {
        const color = id === 'p1' ? 0x38bdf8 : 0xfb7185
        const body = this.add.circle(0, 0, 14, color)
        const label = this.add.text(0, -28, id).setOrigin(0.5)

        const aim = this.add.graphics()
        aim.lineStyle(3, 0xffffff)
        aim.lineBetween(0, 0, 24, 0)

        const root = this.add.container(0, 0, [body, label, aim])
        return { root, aim }
    }
}
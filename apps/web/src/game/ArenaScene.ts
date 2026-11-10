import Phaser from 'phaser'

export type PlayerState = {
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
    private players: PlayerState[] = []
    private playerViews = new Map<string, PlayerView>()

    constructor() {
        super('arena')
    }

    create() {
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.playerViews.clear()
        })

        this.applyPlayers(this.players)
    }

    setPlayers(players: PlayerState[]) {
        this.players = players
        if (this.sys.isActive()) this.applyPlayers(players)
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
        const body = this.add.circle(0, 0, 14, 0x38bdf8)
        const label = this.add.text(0, -28, id).setOrigin(0.5)

        const aim = this.add.graphics()
        aim.lineStyle(3, 0xffffff)
        aim.lineBetween(0, 0, 24, 0)

        const root = this.add.container(0, 0, [body, label, aim])
        return { root, aim }
    }
}
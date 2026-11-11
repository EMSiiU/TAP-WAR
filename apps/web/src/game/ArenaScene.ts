import Phaser from 'phaser'
import arena from '../../../../packages/shared/arena.json'

export type PlayerState = {
    id: string
    x: number
    y: number
    aimAngle: number
    name: string
}

export type ArenaControls = {
    playerId: string
    send: (input: { moveX: number; moveY: number; aimAngle: number }) => void
}

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])
const INPUT_INTERVAL_MS = 50

type PlayerView = {
    root: Phaser.GameObjects.Container
    aim: Phaser.GameObjects.Graphics
}

export default class ArenaScene extends Phaser.Scene {
    private players: PlayerState[] = []
    private playerViews = new Map<string, PlayerView>()

    private controls: ArenaControls
    private cleanupControls?: () => void

    constructor(controls: ArenaControls) {
        super('arena')
        this.controls = controls
    }

    create() {
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.stopControls()
            this.playerViews.clear()
        })

        for (const obstacle of arena.obstacles) {
            this.add
                .rectangle(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 0x475569)
                .setOrigin(0)
        }

        this.applyPlayers(this.players)
        this.startControls()
    }

    stopControls() {
        this.cleanupControls?.()
        this.cleanupControls = undefined
    }

    private startControls() {
        const keys = new Set<string>()
        let pointer: Phaser.Input.Pointer | undefined
        let aimAngle = 0

        const hasFocus = () => !document.hidden && document.hasFocus()

        const sendInput = () => {
            const player = this.players.find(({ id }) => id === this.controls.playerId)
            if (!player) return

            if (pointer) {
                const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
                const dx = world.x - player.x
                const dy = world.y - player.y

                if (dx !== 0 || dy !== 0) {
                    const angle = Math.atan2(dy, dx)
                    aimAngle = angle === Math.PI ? -Math.PI : angle
                }
            }

            this.controls.send({
                moveX: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
                moveY: Number(keys.has('KeyS')) - Number(keys.has('KeyW')),
                aimAngle,
            })
        }

        const onPointerMove = (next: Phaser.Input.Pointer) => {
            pointer = next
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (hasFocus() && !event.repeat && MOVEMENT_KEYS.has(event.code)) {
                keys.add(event.code)
            }
        }

        const onKeyUp = (event: KeyboardEvent) => {
            if (keys.delete(event.code) && hasFocus()) sendInput()
        }

        const stopMovement = () => {
            keys.clear()
            this.controls.send({ moveX: 0, moveY: 0, aimAngle })
        }

        const onVisibilityChange = () => {
            if (document.hidden) stopMovement()
        }

        this.input.on('pointermove', onPointerMove)
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('blur', stopMovement)
        document.addEventListener('visibilitychange', onVisibilityChange)

        const timer = window.setInterval(() => {
            if (hasFocus()) sendInput()
        }, INPUT_INTERVAL_MS)

        this.cleanupControls = () => {
            window.clearInterval(timer)
            this.input.off('pointermove', onPointerMove)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('blur', stopMovement)
            document.removeEventListener('visibilitychange', onVisibilityChange)
        }
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
            view = this.createPlayerView(player.name)
            this.playerViews.set(player.id, view)
        }

        view.root.setPosition(player.x, player.y)
        view.aim.setRotation(player.aimAngle)
        }
    }

    private createPlayerView(name: string): PlayerView {
        const body = this.add.circle(0, 0, arena.playerRadius, 0x38bdf8)
        const label = this.add.text(0, -28, name).setOrigin(0.5)

        const aim = this.add.graphics()
        aim.lineStyle(3, 0xffffff)
        aim.lineBetween(0, 0, 24, 0)

        const root = this.add.container(0, 0, [body, label, aim])
        return { root, aim }
    }
}
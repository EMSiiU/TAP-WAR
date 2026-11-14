import Phaser from 'phaser'

export type PlayerState = {
    id: string
    x: number
    y: number
    aimAngle: number
    name: string
    hp: number
    kills: number
    deaths: number
    isDead: boolean
}

export type BulletState = {
    id: string
    ownerId: string
    x: number
    y: number
    vx: number
    vy: number
    angle: number
}

export type ArenaControls = {
    playerId: string
    send: (input: { moveX: number; moveY: number; aimAngle: number; shoot?: boolean }) => void
}

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])
const INPUT_INTERVAL_MS = 50
const WALK_ANIM_TIMEOUT_MS = 120
const PLAYER_DISPLAY_SIZE = 80
const WEAPON_DISPLAY_SIZE = 68 // ~85% del tamaño del personaje (68 / 80)
const WEAPON_BASE_Y = -10 // Altura de cintura/manos proporcional al nuevo tamaño
const WEAPON_RADIAL_OFFSET = 15 // Desplazamiento radial en dirección de aimAngle
const BULLET_DISPLAY_SIZE = 24
const HP_BAR_WIDTH = 48
const HP_BAR_HEIGHT = 6
const HP_BAR_Y = -62

type PlayerView = {
    root: Phaser.GameObjects.Container
    body: Phaser.GameObjects.Sprite
    weapon: Phaser.GameObjects.Image
    hpBarBg: Phaser.GameObjects.Rectangle
    hpBarFill: Phaser.GameObjects.Rectangle
    isDead: boolean
    lastX: number
    lastY: number
    lastMovedAt: number
}

export default class ArenaScene extends Phaser.Scene {
    private players: PlayerState[] = []
    private bullets: BulletState[] = []
    private playerViews = new Map<string, PlayerView>()
    private bulletViews = new Map<string, Phaser.GameObjects.Image>()
    private isReady = false

    private controls: ArenaControls
    private cleanupControls?: () => void

    constructor(controls: ArenaControls) {
        super('arena')
        this.controls = controls
    }

    preload() {
        this.load.image('arena-desert', '/assets/maps/arena-desert.png')
        this.load.image('player-idle', '/assets/characters/player-idle.png')
        this.load.image('player-dead', '/assets/characters/player-dead.png')
        this.load.spritesheet('player-walk', '/assets/characters/player-walk.png', {
            frameWidth: 128,
            frameHeight: 128,
        })
        this.load.image('weapon', '/assets/characters/weapon.png')
        this.load.image('bullet', '/assets/characters/bullet.png')
    }

    create() {
        this.isReady = true

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.isReady = false
            this.stopControls()
            this.playerViews.clear()
            this.bulletViews.clear()
        })

        this.add.image(0, 0, 'arena-desert').setOrigin(0, 0)

        if (!this.anims.exists('walk')) {
            this.anims.create({
                key: 'walk',
                frames: this.anims.generateFrameNumbers('player-walk', { start: 0, end: 1 }),
                frameRate: 8,
                repeat: -1,
            })
        }

        this.applyPlayers(this.players)
        this.applyBullets(this.bullets)
        this.startControls()
    }

    update(time: number) {
        for (const view of this.playerViews.values()) {
            if (view.isDead) {
                if (view.body.anims.isPlaying) view.body.anims.stop()
                if (view.body.texture.key !== 'player-dead') {
                    view.body.setTexture('player-dead')
                }
                continue
            }

            const isMoving = time - view.lastMovedAt < WALK_ANIM_TIMEOUT_MS
            if (isMoving) {
                view.body.anims.play('walk', true)
            } else if (view.body.anims.isPlaying || view.body.texture.key !== 'player-idle') {
                view.body.anims.stop()
                view.body.setTexture('player-idle')
            }
        }
    }

    stopControls() {
        this.cleanupControls?.()
        this.cleanupControls = undefined
    }

    private startControls() {
        const keys = new Set<string>()
        let pointer: Phaser.Input.Pointer | undefined
        let pointerDown = false
        let spaceDown = false
        let pendingShot = false
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

            const isPointerDown = pointerDown || this.input.activePointer.leftButtonDown()
            const shoot = isPointerDown || spaceDown || pendingShot
            pendingShot = false

            this.controls.send({
                moveX: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
                moveY: Number(keys.has('KeyS')) - Number(keys.has('KeyW')),
                aimAngle,
                shoot,
            })
        }

        const onPointerMove = (next: Phaser.Input.Pointer) => {
            pointer = next
        }

        const onPointerDown = (next: Phaser.Input.Pointer) => {
            if (next.button === 0 || next.leftButtonDown()) {
                pointer = next
                pointerDown = true
                pendingShot = true
                sendInput()
            }
        }

        const onPointerUp = (next: Phaser.Input.Pointer) => {
            if (next.button === 0 || !next.leftButtonDown()) {
                pointerDown = false
            }
        }

        const onGlobalPointerUp = (event: PointerEvent) => {
            if (event.button === 0) {
                pointerDown = false
            }
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (!hasFocus() || event.repeat) return
            if (MOVEMENT_KEYS.has(event.code)) {
                keys.add(event.code)
            } else if (event.code === 'Space') {
                spaceDown = true
                pendingShot = true
                sendInput()
            }
        }

        const onKeyUp = (event: KeyboardEvent) => {
            if (event.code === 'Space') {
                spaceDown = false
            }
            if (keys.delete(event.code) && hasFocus()) sendInput()
        }

        const stopMovement = () => {
            keys.clear()
            pointerDown = false
            spaceDown = false
            pendingShot = false
            this.controls.send({ moveX: 0, moveY: 0, aimAngle, shoot: false })
        }

        const onVisibilityChange = () => {
            if (document.hidden) stopMovement()
        }

        this.input.on('pointermove', onPointerMove)
        this.input.on('pointerdown', onPointerDown)
        this.input.on('pointerup', onPointerUp)
        window.addEventListener('pointerup', onGlobalPointerUp)
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
            this.input.off('pointerdown', onPointerDown)
            this.input.off('pointerup', onPointerUp)
            window.removeEventListener('pointerup', onGlobalPointerUp)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('blur', stopMovement)
            document.removeEventListener('visibilitychange', onVisibilityChange)
        }
    }

    setPlayers(players: PlayerState[]) {
        this.players = players
        if (this.isReady && this.sys.isActive()) this.applyPlayers(players)
    }

    setBullets(bullets: BulletState[]) {
        this.bullets = bullets
        if (this.isReady && this.sys.isActive()) this.applyBullets(bullets)
    }

    private applyBullets(bullets: BulletState[]) {
        const activeIds = new Set(bullets.map((bullet) => bullet.id))

        for (const [id, sprite] of this.bulletViews) {
            if (!activeIds.has(id)) {
                sprite.destroy()
                this.bulletViews.delete(id)
            }
        }

        for (const bullet of bullets) {
            let sprite = this.bulletViews.get(bullet.id)
            if (!sprite) {
                sprite = this.add
                    .image(bullet.x, bullet.y, 'bullet')
                    .setDisplaySize(BULLET_DISPLAY_SIZE, BULLET_DISPLAY_SIZE)
                this.bulletViews.set(bullet.id, sprite)
            }

            sprite.setPosition(bullet.x, bullet.y)
            sprite.setRotation(bullet.angle)
            sprite.setDepth(bullet.y + 2)
        }
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
                view = this.createPlayerView(player.name, player.x, player.y)
                this.playerViews.set(player.id, view)
            } else if (player.x !== view.lastX || player.y !== view.lastY) {
                view.lastX = player.x
                view.lastY = player.y
                view.lastMovedAt = this.time.now
            }

            const facingLeft = player.aimAngle > Math.PI / 2 || player.aimAngle < -Math.PI / 2
            view.isDead = Boolean(player.isDead)
            view.root.setPosition(player.x, player.y)
            view.root.setDepth(player.y)
            view.body.setFlipX(facingLeft)
            view.body.setDepth(player.y)

            if (view.isDead) {
                if (view.body.anims.isPlaying) view.body.anims.stop()
                if (view.body.texture.key !== 'player-dead') {
                    view.body.setTexture('player-dead')
                }
                view.weapon.setVisible(false)
                view.hpBarBg.setVisible(false)
                view.hpBarFill.setVisible(false)
                continue
            }

            view.weapon.setVisible(true)
            view.hpBarBg.setVisible(true)
            view.hpBarFill.setVisible(true)

            const hpRatio = Math.max(0, Math.min(1, (player.hp ?? 100) / 100))
            view.hpBarFill.setDisplaySize(HP_BAR_WIDTH * hpRatio, HP_BAR_HEIGHT - 2)
            view.hpBarFill.setFillStyle(
                hpRatio >= 0.6 ? 0x22c55e : hpRatio >= 0.3 ? 0xeab308 : 0xef4444,
            )

            const weaponX = Math.cos(player.aimAngle) * WEAPON_RADIAL_OFFSET
            const weaponY = WEAPON_BASE_Y + Math.sin(player.aimAngle) * WEAPON_RADIAL_OFFSET
            view.weapon.setPosition(weaponX, weaponY)
            view.weapon.setRotation(player.aimAngle)
            view.weapon.setFlipY(facingLeft)
            view.weapon.setDepth(player.y + 1)
        }
    }

    private createPlayerView(name: string, x: number, y: number): PlayerView {
        const body = this.add
            .sprite(0, 0, 'player-idle')
            .setDisplaySize(PLAYER_DISPLAY_SIZE, PLAYER_DISPLAY_SIZE)
            .setOrigin(0.5, 0.85)

        const weapon = this.add
            .image(0, WEAPON_BASE_Y, 'weapon')
            .setDisplaySize(WEAPON_DISPLAY_SIZE, WEAPON_DISPLAY_SIZE)
            .setOrigin(0.2, 0.5)

        const hpBarBg = this.add
            .rectangle(-HP_BAR_WIDTH / 2, HP_BAR_Y, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x1e1b2e)
            .setOrigin(0, 0.5)

        const hpBarFill = this.add
            .rectangle(-HP_BAR_WIDTH / 2 + 1, HP_BAR_Y, HP_BAR_WIDTH - 2, HP_BAR_HEIGHT - 2, 0x22c55e)
            .setOrigin(0, 0.5)

        const label = this.add
            .text(0, -76, name, {
                fontSize: '14px',
                color: '#ffffff',
                stroke: '#1e1b2e',
                strokeThickness: 3,
            })
            .setOrigin(0.5)

        const root = this.add.container(x, y, [body, weapon, hpBarBg, hpBarFill, label])
        return {
            root,
            body,
            weapon,
            hpBarBg,
            hpBarFill,
            isDead: false,
            lastX: x,
            lastY: y,
            lastMovedAt: -WALK_ANIM_TIMEOUT_MS,
        }
    }
}
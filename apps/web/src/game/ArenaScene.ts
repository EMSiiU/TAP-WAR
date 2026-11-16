import Phaser from 'phaser'

export type MatchPhase = 'waiting' | 'playing' | 'finished'
export type PlayerSkin = 'fox' | 'squirrel' | 'mouse' | 'rabbit'
export type WeaponType = 'rifle' | 'shotgun' | 'sniper'

export type PlayerState = {
    id: string
    x: number
    y: number
    aimAngle: number
    name: string
    skin: PlayerSkin
    weaponType: WeaponType
    hp: number
    kills: number
    deaths: number
    isDead: boolean
    emote: string
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

export type PickupState = {
    id: string
    weaponType: WeaponType
    x: number
    y: number
}

export type ArenaControls = {
    playerId: string
    send: (input: { moveX: number; moveY: number; aimAngle: number; shoot?: boolean }) => void
    sendEmote?: (emote: 'dots' | 'alert') => void
}

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])
const INPUT_INTERVAL_MS = 50
const WALK_ANIM_TIMEOUT_MS = 120
const PLAYER_DISPLAY_SIZE = 80
const WEAPON_DISPLAY_SIZE = 68 // ~85% del tamaño del personaje (68 / 80)
const WEAPON_BASE_Y = -10 // Altura de cintura/manos proporcional al nuevo tamaño
const WEAPON_RADIAL_OFFSET = 15 // Desplazamiento radial en dirección de aimAngle
const BULLET_DISPLAY_SIZE = 24
const PICKUP_DISPLAY_SIZE = 44
const EMOTE_DISPLAY_SIZE = 32
const EMOTE_OFFSET_Y = -104
const HP_BAR_WIDTH = 48
const HP_BAR_HEIGHT = 6
const HP_BAR_Y = -62
const SKINS: PlayerSkin[] = ['fox', 'squirrel', 'mouse', 'rabbit']
const WEAPON_TYPES: WeaponType[] = ['rifle', 'shotgun', 'sniper']

type PlayerView = {
    root: Phaser.GameObjects.Container
    body: Phaser.GameObjects.Sprite
    weapon: Phaser.GameObjects.Image
    emoteSprite: Phaser.GameObjects.Image
    hpBarBg: Phaser.GameObjects.Rectangle
    hpBarFill: Phaser.GameObjects.Rectangle
    skin: PlayerSkin
    weaponType: WeaponType
    isDead: boolean
    lastHp: number
    targetX: number
    targetY: number
    lastX: number
    lastY: number
    lastMovedAt: number
}

type PickupView = {
    root: Phaser.GameObjects.Container
    sprite: Phaser.GameObjects.Image
}

export default class ArenaScene extends Phaser.Scene {
    private players: PlayerState[] = []
    private bullets: BulletState[] = []
    private pickups: PickupState[] = []
    private currentPhase: MatchPhase = 'waiting'
    private playerViews = new Map<string, PlayerView>()
    private bulletViews = new Map<string, Phaser.GameObjects.Image>()
    private pickupViews = new Map<string, PickupView>()
    private isReady = false

    private controls: ArenaControls
    private cleanupControls?: () => void

    constructor(controls: ArenaControls) {
        super('arena')
        this.controls = controls
    }

    preload() {
        this.load.image('arena-desert', '/assets/maps/arena-desert.png')
        for (const skin of SKINS) {
            this.load.image(`player-${skin}-idle`, `/assets/characters/player-${skin}-idle.png`)
            this.load.image(`player-${skin}-dead`, `/assets/characters/player-${skin}-dead.png`)
            this.load.spritesheet(`player-${skin}-walk`, `/assets/characters/player-${skin}-walk.png`, {
                frameWidth: 128,
                frameHeight: 128,
            })
        }
        for (const weaponType of WEAPON_TYPES) {
            this.load.image(`weapon-${weaponType}`, `/assets/characters/weapon-${weaponType}.png`)
        }
        this.load.image('bullet', '/assets/characters/bullet.png')
        this.load.image('emote-dots', '/assets/ui/emote-dots.png')
        this.load.image('emote-alert', '/assets/ui/emote-alert.png')
        this.load.audio('shoot-a', '/assets/sounds/shoot-a.ogg')
        this.load.audio('hurt-a', '/assets/sounds/hurt-a.ogg')
        this.load.audio('explosion-a', '/assets/sounds/explosion-a.ogg')
        this.load.audio('select-a', '/assets/sounds/select-a.ogg')
        this.load.audio('coin-a', '/assets/sounds/coin-a.ogg')
    }

    create() {
        this.isReady = true

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.isReady = false
            this.stopControls()
            this.playerViews.clear()
            this.bulletViews.clear()
            this.pickupViews.clear()
        })

        this.add.image(0, 0, 'arena-desert').setOrigin(0, 0)

        for (const skin of SKINS) {
            const animKey = `walk-${skin}`
            if (!this.anims.exists(animKey)) {
                this.anims.create({
                    key: animKey,
                    frames: this.anims.generateFrameNumbers(`player-${skin}-walk`, { start: 0, end: 1 }),
                    frameRate: 8,
                    repeat: -1,
                })
            }
        }

        this.applyPlayers(this.players)
        this.applyBullets(this.bullets)
        this.applyPickups(this.pickups)
        this.startControls()
    }

    update(time: number, delta: number) {
        const interpFactor = 1 - Math.pow(1 - 0.25, delta / 16.667)

        for (const [id, view] of this.playerViews) {
            if (id !== this.controls.playerId) {
                const nextX = Phaser.Math.Linear(view.root.x, view.targetX, interpFactor)
                const nextY = Phaser.Math.Linear(view.root.y, view.targetY, interpFactor)
                view.root.setPosition(nextX, nextY)
                view.root.setDepth(nextY)
                view.body.setDepth(nextY)
                view.weapon.setDepth(nextY + 1)
            }

            const deadKey = `player-${view.skin}-dead`
            const idleKey = `player-${view.skin}-idle`
            const walkKey = `walk-${view.skin}`

            if (view.isDead) {
                if (view.body.anims.isPlaying) view.body.anims.stop()
                if (view.body.texture.key !== deadKey) {
                    view.body.setTexture(deadKey)
                }
                continue
            }

            const isMoving = time - view.lastMovedAt < WALK_ANIM_TIMEOUT_MS
            if (isMoving) {
                view.body.anims.play(walkKey, true)
            } else if (view.body.anims.isPlaying || view.body.texture.key !== idleKey) {
                view.body.anims.stop()
                view.body.setTexture(idleKey)
            }
        }
    }

    private playSound(key: string, volume: number) {
        if (!this.isReady || this.sound.locked || !this.cache.audio.exists(key)) return
        this.sound.play(key, { volume })
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
            } else if (event.code === 'Digit1' || event.code === 'Numpad1') {
                this.controls.sendEmote?.('dots')
            } else if (event.code === 'Digit2' || event.code === 'Numpad2') {
                this.controls.sendEmote?.('alert')
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

    setPickups(pickups: PickupState[]) {
        this.pickups = pickups
        if (this.isReady && this.sys.isActive()) this.applyPickups(pickups)
    }

    private applyPickups(pickups: PickupState[]) {
        const activeIds = new Set(pickups.map((pickup) => pickup.id))

        for (const [id, view] of this.pickupViews) {
            if (!activeIds.has(id)) {
                view.root.destroy()
                this.pickupViews.delete(id)
            }
        }

        for (const pickup of pickups) {
            if (this.pickupViews.has(pickup.id)) continue

            const glow = this.add.circle(0, 0, 22, 0xfbbf24, 0.28)
            glow.setStrokeStyle(2, 0x3d2e4f)
            const sprite = this.add
                .image(0, 0, `weapon-${pickup.weaponType}`)
                .setDisplaySize(PICKUP_DISPLAY_SIZE, PICKUP_DISPLAY_SIZE)
            const root = this.add.container(pickup.x, pickup.y, [glow, sprite]).setDepth(pickup.y)

            this.tweens.add({
                targets: sprite,
                y: -4,
                duration: 700,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            })

            this.pickupViews.set(pickup.id, { root, sprite })
        }
    }

    setPhase(phase: MatchPhase) {
        const previous = this.currentPhase
        this.currentPhase = phase
        if (this.isReady && phase === 'playing' && previous !== 'playing') {
            this.playSound('select-a', 0.4)
        }
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
                this.spawnMuzzleFlash(bullet.x, bullet.y)
                this.playSound('shoot-a', 0.35)

                if (bullet.ownerId === this.controls.playerId) {
                    this.cameras.main.shake(60, 0.002)
                }
            }

            sprite.setPosition(bullet.x, bullet.y)
            sprite.setRotation(bullet.angle)
            sprite.setDepth(bullet.y + 2)
        }
    }

    private spawnMuzzleFlash(x: number, y: number) {
        const flash = this.add.circle(x, y, 9, 0xfef08a, 0.95).setDepth(y + 3)
        this.tweens.add({
            targets: flash,
            alpha: 0,
            scale: 1.6,
            duration: 60,
            onComplete: () => flash.destroy(),
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
            const skin: PlayerSkin = SKINS.includes(player.skin) ? player.skin : 'fox'
            const weaponType: WeaponType = WEAPON_TYPES.includes(player.weaponType)
                ? player.weaponType
                : 'rifle'

            let view = this.playerViews.get(player.id)

            if (!view) {
                view = this.createPlayerView(player.name, player.x, player.y, player.hp ?? 100, skin, weaponType)
                this.playerViews.set(player.id, view)
            } else {
                if (player.x !== view.lastX || player.y !== view.lastY) {
                    view.lastX = player.x
                    view.lastY = player.y
                    view.lastMovedAt = this.time.now
                }

                if (view.weaponType !== weaponType) {
                    view.weaponType = weaponType
                    view.weapon.setTexture(`weapon-${weaponType}`)
                    if (weaponType !== 'rifle') {
                        this.playSound('coin-a', 0.45)
                    }
                }

                const currentHp = player.hp ?? 100
                if (currentHp < view.lastHp) {
                    this.playSound('hurt-a', 0.45)
                    view.body.setTint(0xff4d4d)
                    this.time.delayedCall(120, () => {
                        if (view && view.body.scene) view.body.clearTint()
                    })
                    if (player.id === this.controls.playerId) {
                        this.cameras.main.shake(60, 0.002)
                    }
                }
                view.lastHp = currentHp
            }

            const wasDead = view.isDead
            const isDeadNow = Boolean(player.isDead)
            if (isDeadNow && !wasDead) {
                this.playSound('explosion-a', 0.5)
            }

            const isLocal = player.id === this.controls.playerId
            const respawnTeleport =
                (!isDeadNow && wasDead) || Math.hypot(player.x - view.root.x, player.y - view.root.y) > 160

            view.targetX = player.x
            view.targetY = player.y
            if (isLocal || respawnTeleport) {
                view.root.setPosition(player.x, player.y)
                view.root.setDepth(player.y)
                view.body.setDepth(player.y)
            }

            const facingLeft = player.aimAngle > Math.PI / 2 || player.aimAngle < -Math.PI / 2
            view.isDead = isDeadNow
            view.body.setFlipX(facingLeft)

            if (player.emote === 'dots' || player.emote === 'alert') {
                const emoteKey = `emote-${player.emote}`
                if (view.emoteSprite.texture.key !== emoteKey) {
                    view.emoteSprite.setTexture(emoteKey)
                }
                view.emoteSprite.setVisible(true)
            } else {
                view.emoteSprite.setVisible(false)
            }

            const deadKey = `player-${view.skin}-dead`
            if (view.isDead) {
                if (view.body.anims.isPlaying) view.body.anims.stop()
                if (view.body.texture.key !== deadKey) {
                    view.body.setTexture(deadKey)
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
            view.weapon.setDepth((isLocal ? player.y : view.root.y) + 1)
        }
    }

    private createPlayerView(
        name: string,
        x: number,
        y: number,
        hp: number,
        skin: PlayerSkin,
        weaponType: WeaponType,
    ): PlayerView {
        const body = this.add
            .sprite(0, 0, `player-${skin}-idle`)
            .setDisplaySize(PLAYER_DISPLAY_SIZE, PLAYER_DISPLAY_SIZE)
            .setOrigin(0.5, 0.85)

        const weapon = this.add
            .image(0, WEAPON_BASE_Y, `weapon-${weaponType}`)
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

        const emoteSprite = this.add
            .image(0, EMOTE_OFFSET_Y, 'emote-dots')
            .setDisplaySize(EMOTE_DISPLAY_SIZE, EMOTE_DISPLAY_SIZE)
            .setVisible(false)

        const root = this.add.container(x, y, [body, weapon, hpBarBg, hpBarFill, label, emoteSprite])
        return {
            root,
            body,
            weapon,
            emoteSprite,
            hpBarBg,
            hpBarFill,
            skin,
            weaponType,
            isDead: false,
            lastHp: hp,
            targetX: x,
            targetY: y,
            lastX: x,
            lastY: y,
            lastMovedAt: -WALK_ANIM_TIMEOUT_MS,
        }
    }
}
import Phaser from 'phaser'

export type MatchPhase = 'waiting' | 'playing' | 'finished'
export type PlayerSkin = 'fox' | 'squirrel' | 'mouse' | 'rabbit'
export type TeamColor = 'orange' | 'blue'
export type WeaponType =
    | 'pistol'
    | 'revolver'
    | 'smg'
    | 'sniper'
    | 'launcher'
    | 'rifle'
    | 'plasma'
    | 'shotgun'
    | 'knife'
    | 'axe'

export type PlayerState = {
    id: string
    x: number
    y: number
    aimAngle: number
    name: string
    skin: PlayerSkin
    teamColor: TeamColor
    weaponType: WeaponType
    ammo?: number
    maxAmmo?: number
    lastMeleeWeapon?: 'knife' | 'axe'
    hp: number
    kills: number
    deaths: number
    isDead: boolean
    emote: string
    meleeAttackSeq?: number
    lastMeleeAngle?: number
}

export type BulletState = {
    id: string
    ownerId: string
    x: number
    y: number
    vx: number
    vy: number
    angle: number
    weaponType?: WeaponType
    teamColor: TeamColor
    scale: number
}

export type PickupState = {
    id: string
    weaponType: WeaponType
    x: number
    y: number
}

export type CrosshairStyle = 'outline' | 'plain'

export type ArenaControls = {
    playerId: string
    send: (input: { moveX: number; moveY: number; aimAngle: number; shoot?: boolean }) => void
    sendEmote?: (emote: 'dots' | 'alert') => void
    sendPause?: (paused: boolean) => void
}

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])
const INPUT_INTERVAL_MS = 50
const WALK_ANIM_TIMEOUT_MS = 120
const PLAYER_DISPLAY_SIZE = 80
const WEAPON_DISPLAY_SIZE = 68 // ~85% del tamaño del personaje (68 / 80)
const WEAPON_BASE_Y = -10 // Altura de cintura/manos proporcional al nuevo tamaño
const WEAPON_RADIAL_OFFSET = 15 // Desplazamiento radial en dirección de aimAngle
const SMALL_BULLET_BASE_SIZE = 18
const HEAVY_BULLET_BASE_SIZE = 16
const SHELL_SMALL_SIZE = 14
const SHELL_SHOTGUN_SIZE = 16
const PICKUP_DISPLAY_SIZE = 44
const EMOTE_DISPLAY_SIZE = 32
const EMOTE_OFFSET_Y = -104
const HP_BAR_WIDTH = 56
const HP_BAR_HEIGHT = 16
const HP_BAR_Y = -62
const MAX_AIM_RADIUS = 270
const CROSSHAIR_DISPLAY_SIZE = 32
const CROSSHAIR_BASE_SCALE = CROSSHAIR_DISPLAY_SIZE / 64
const SKINS: PlayerSkin[] = ['fox', 'squirrel', 'mouse', 'rabbit']
const TEAM_COLORS: TeamColor[] = ['orange', 'blue']
const HEAVY_WEAPONS = new Set<WeaponType>(['rifle', 'sniper', 'launcher', 'plasma'])
const MELEE_WEAPONS = new Set<WeaponType>(['knife', 'axe'])
const WEAPON_TYPES: WeaponType[] = [
    'pistol',
    'revolver',
    'smg',
    'sniper',
    'launcher',
    'rifle',
    'plasma',
    'shotgun',
    'knife',
    'axe',
]

type PlayerView = {
    root: Phaser.GameObjects.Container
    body: Phaser.GameObjects.Sprite
    weapon: Phaser.GameObjects.Image
    emoteSprite: Phaser.GameObjects.Image
    hpBarFrame: Phaser.GameObjects.Image
    hpBarFill: Phaser.GameObjects.Image
    skin: PlayerSkin
    teamColor: TeamColor
    weaponType: WeaponType
    isDead: boolean
    lastHp: number
    lastMeleeSeq: number
    isSwinging: boolean
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
    private crosshairStyle: CrosshairStyle = 'outline'
    private isPaused = false
    private aimOffsetX = 120
    private aimOffsetY = 0
    private playerViews = new Map<string, PlayerView>()
    private bulletViews = new Map<string, Phaser.GameObjects.Image>()
    private pickupViews = new Map<string, PickupView>()
    private lastShellAtByOwner = new Map<string, number>()
    private aimCrosshair?: Phaser.GameObjects.Image
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
            for (const color of TEAM_COLORS) {
                this.load.image(
                    `weapon-${weaponType}-${color}`,
                    `/assets/weapons/weapon-${weaponType}-${color}.png`,
                )
                if (!MELEE_WEAPONS.has(weaponType)) {
                    this.load.image(
                        `crosshair-${weaponType}-${color}`,
                        `/assets/ui/crosshair-${weaponType}-${color}.png`,
                    )
                }
            }
        }
        this.load.image('bullet-small', '/assets/characters/bullet-small.png')
        this.load.image('bullet-heavy', '/assets/characters/bullet-heavy.png')
        this.load.image('bullet-plasma', '/assets/characters/bullet-plasma.png')
        this.load.image('shell-small', '/assets/characters/shell-small.png')
        this.load.image('shell-shotgun', '/assets/characters/shell-shotgun.png')
        this.load.image('hp-bar-frame', '/assets/ui/hp-bar-frame.png')
        this.load.image('hp-bar-fill', '/assets/ui/hp-bar-fill.png')
        this.load.image('hp-bar-fill-blue', '/assets/ui/hp-bar-fill-blue.png')
        this.load.image('emote-dots', '/assets/ui/emote-dots.png')
        this.load.image('emote-alert', '/assets/ui/emote-alert.png')
        this.load.image('emote-skull', '/assets/ui/emote-skull.png')
        this.load.audio('shoot-a', '/assets/sounds/shoot-a.ogg')
        this.load.audio('shoot-b', '/assets/sounds/shoot-b.ogg')
        this.load.audio('shoot-f', '/assets/sounds/shoot-f.ogg')
        this.load.audio('shoot-g', '/assets/sounds/shoot-g.ogg')
        this.load.audio('hurt-a', '/assets/sounds/hurt-a.ogg')
        this.load.audio('hurt-d', '/assets/sounds/hurt-d.ogg')
        this.load.audio('explosion-a', '/assets/sounds/explosion-a.ogg')
        this.load.audio('lose-c', '/assets/sounds/lose-c.ogg')
        this.load.audio('select-a', '/assets/sounds/select-a.ogg')
        this.load.audio('coin-a', '/assets/sounds/coin-a.ogg')
        this.load.audio('fall-a', '/assets/sounds/fall-a.ogg')
        this.load.audio('error-a', '/assets/sounds/error-a.ogg')
    }

    create() {
        this.isReady = true
        this.input.setDefaultCursor('none')

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.isReady = false
            this.input.setDefaultCursor('default')
            if (document.pointerLockElement === this.game.canvas) {
                document.exitPointerLock?.()
            }
            this.stopControls()
            this.aimCrosshair?.destroy()
            this.aimCrosshair = undefined
            this.playerViews.clear()
            this.bulletViews.clear()
            this.pickupViews.clear()
            this.lastShellAtByOwner.clear()
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

        this.aimCrosshair = this.add
            .image(0, 0, 'crosshair-rifle-orange')
            .setOrigin(0.5, 0.5)
            .setDisplaySize(CROSSHAIR_DISPLAY_SIZE, CROSSHAIR_DISPLAY_SIZE)
            .setDepth(9999)
            .setVisible(false)

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

        this.updateCrosshair()
    }

    setCrosshairStyle(style: CrosshairStyle) {
        this.crosshairStyle = style
    }

    setPaused(paused: boolean) {
        this.isPaused = paused
        if (paused && this.isReady && this.game?.canvas && document.pointerLockElement === this.game.canvas) {
            document.exitPointerLock?.()
        }
    }

    resume() {
        this.isPaused = false
        this.controls.sendPause?.(false)
        if (this.currentPhase !== 'finished') {
            this.game.canvas.requestPointerLock?.()
        }
    }

    private updateCrosshair() {
        if (!this.aimCrosshair) return

        const localPlayer = this.players.find((p) => p.id === this.controls.playerId)
        if (!localPlayer || localPlayer.isDead || this.currentPhase === 'finished' || this.isPaused) {
            this.aimCrosshair.setVisible(false)
            return
        }

        const localView = this.playerViews.get(this.controls.playerId)
        const weaponType = localView?.weaponType ?? 'rifle'
        if (MELEE_WEAPONS.has(weaponType)) {
            this.aimCrosshair.setVisible(false)
            return
        }

        const variant = this.crosshairStyle === 'plain' ? 'blue' : 'orange'
        const crosshairKey = `crosshair-${weaponType}-${variant}`
        if (this.aimCrosshair.texture.key !== crosshairKey && this.textures.exists(crosshairKey)) {
            this.aimCrosshair.setTexture(crosshairKey)
        }

        this.aimCrosshair.setPosition(
            localPlayer.x + this.aimOffsetX,
            localPlayer.y + this.aimOffsetY,
        )
        this.aimCrosshair.setVisible(true)
    }

    private pulseCrosshair() {
        if (!this.aimCrosshair || !this.aimCrosshair.visible) return
        this.tweens.killTweensOf(this.aimCrosshair)
        this.aimCrosshair.setScale(CROSSHAIR_BASE_SCALE)
        this.tweens.add({
            targets: this.aimCrosshair,
            scale: CROSSHAIR_BASE_SCALE * 1.25,
            duration: 40,
            yoyo: true,
        })
    }

    private playSound(key: string, volume: number) {
        if (!this.isReady || this.sound.locked || !this.cache.audio.exists(key)) return
        this.sound.play(key, { volume })
    }

    stopControls() {
        this.cleanupControls?.()
        this.cleanupControls = undefined
    }

    private clampAimOffset(dx: number, dy: number) {
        const dist = Math.hypot(dx, dy)
        if (dist > MAX_AIM_RADIUS && dist > 0) {
            const scale = MAX_AIM_RADIUS / dist
            this.aimOffsetX = dx * scale
            this.aimOffsetY = dy * scale
        } else {
            this.aimOffsetX = dx
            this.aimOffsetY = dy
        }
    }

    private startControls() {
        const keys = new Set<string>()
        let pointerDown = false
        let spaceDown = false
        let pendingShot = false
        let aimAngle = 0

        const hasFocus = () => !document.hidden && document.hasFocus()

        const sendInput = () => {
            if (this.isPaused || this.currentPhase === 'finished') return
            const player = this.players.find(({ id }) => id === this.controls.playerId)
            if (!player) return

            const aimDy = this.aimOffsetY - WEAPON_BASE_Y
            if (this.aimOffsetX !== 0 || aimDy !== 0) {
                const angle = Math.atan2(aimDy, this.aimOffsetX)
                aimAngle = angle === Math.PI ? -Math.PI : angle
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
            if (this.isPaused || this.currentPhase === 'finished') return
            if (document.pointerLockElement === this.game.canvas) return
            const player = this.players.find(({ id }) => id === this.controls.playerId)
            if (!player) return

            const world = this.cameras.main.getWorldPoint(next.x, next.y)
            this.clampAimOffset(world.x - player.x, world.y - player.y)
        }

        const onLockedMouseMove = (event: MouseEvent) => {
            if (this.isPaused || this.currentPhase === 'finished') return
            if (document.pointerLockElement !== this.game.canvas) return

            const rect = this.game.canvas.getBoundingClientRect()
            const scaleX = rect.width > 0 ? this.scale.width / rect.width : 1
            const scaleY = rect.height > 0 ? this.scale.height / rect.height : 1
            this.clampAimOffset(
                this.aimOffsetX + event.movementX * scaleX,
                this.aimOffsetY + event.movementY * scaleY,
            )
        }

        const onPointerDown = (next: Phaser.Input.Pointer) => {
            if (this.isPaused || this.currentPhase === 'finished') return
            if (document.pointerLockElement !== this.game.canvas) {
                this.game.canvas.requestPointerLock?.()
            }
            if (next.button === 0 || next.leftButtonDown()) {
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

        const stopMovement = () => {
            keys.clear()
            pointerDown = false
            spaceDown = false
            pendingShot = false
            this.controls.send({ moveX: 0, moveY: 0, aimAngle, shoot: false })
        }

        const onPointerLockChange = () => {
            const locked = document.pointerLockElement === this.game.canvas
            if (locked) {
                if (this.isPaused) {
                    this.isPaused = false
                    this.controls.sendPause?.(false)
                }
            } else if (this.currentPhase !== 'finished' && this.isReady && !this.isPaused) {
                this.isPaused = true
                stopMovement()
                this.controls.sendPause?.(true)
            }
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'Escape' && !event.repeat && this.currentPhase !== 'finished') {
                if (this.isPaused) {
                    this.resume()
                } else {
                    this.isPaused = true
                    stopMovement()
                    if (document.pointerLockElement === this.game.canvas) {
                        document.exitPointerLock?.()
                    }
                    this.controls.sendPause?.(true)
                }
                return
            }

            if (!hasFocus() || event.repeat || this.isPaused) return
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
            if (keys.delete(event.code) && hasFocus() && !this.isPaused) sendInput()
        }

        const onVisibilityChange = () => {
            if (document.hidden) stopMovement()
        }

        this.input.on('pointermove', onPointerMove)
        this.input.on('pointerdown', onPointerDown)
        this.input.on('pointerup', onPointerUp)
        document.addEventListener('mousemove', onLockedMouseMove)
        document.addEventListener('pointerlockchange', onPointerLockChange)
        window.addEventListener('pointerup', onGlobalPointerUp)
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('blur', stopMovement)
        document.addEventListener('visibilitychange', onVisibilityChange)

        const timer = window.setInterval(() => {
            if (hasFocus() && !this.isPaused) sendInput()
        }, INPUT_INTERVAL_MS)

        this.cleanupControls = () => {
            window.clearInterval(timer)
            this.input.off('pointermove', onPointerMove)
            this.input.off('pointerdown', onPointerDown)
            this.input.off('pointerup', onPointerUp)
            document.removeEventListener('mousemove', onLockedMouseMove)
            document.removeEventListener('pointerlockchange', onPointerLockChange)
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
                .image(0, 0, `weapon-${pickup.weaponType}-orange`)
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
        if (phase === 'finished') {
            this.isPaused = false
            if (document.pointerLockElement === this.game.canvas) {
                document.exitPointerLock?.()
            }
        }
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
            const weaponType: WeaponType = bullet.weaponType ?? 'rifle'
            const isHeavy = HEAVY_WEAPONS.has(weaponType)
            const textureKey =
                weaponType === 'plasma' ? 'bullet-plasma' : isHeavy ? 'bullet-heavy' : 'bullet-small'
            const baseSize = isHeavy ? HEAVY_BULLET_BASE_SIZE : SMALL_BULLET_BASE_SIZE
            const bulletScale = typeof bullet.scale === 'number' && bullet.scale > 0 ? bullet.scale : 1
            const displaySize = baseSize * bulletScale

            if (!sprite) {
                sprite = this.add
                    .image(bullet.x, bullet.y, textureKey)
                    .setDisplaySize(displaySize, displaySize)
                if (weaponType === 'launcher') {
                    sprite.setTint(0xff6b35)
                }
                this.bulletViews.set(bullet.id, sprite)
                this.spawnMuzzleFlash(bullet.x, bullet.y)
                const shootSfx =
                    weaponType === 'plasma'
                        ? 'shoot-b'
                        : weaponType === 'launcher'
                          ? 'explosion-a'
                          : 'shoot-g'
                this.playSound(shootSfx, weaponType === 'launcher' ? 0.4 : 0.35)
                this.maybeEjectShell(bullet, weaponType, isHeavy)

                if (bullet.ownerId === this.controls.playerId) {
                    this.cameras.main.shake(60, 0.002)
                    this.pulseCrosshair()
                }
            }

            sprite.setPosition(bullet.x, bullet.y)
            sprite.setRotation(weaponType === 'plasma' ? bullet.angle + Math.PI / 2 : bullet.angle)
            sprite.setDepth(bullet.y + 2)
        }
    }

    private maybeEjectShell(bullet: BulletState, weaponType: WeaponType, isHeavy: boolean) {
        if (weaponType !== 'shotgun' && !isHeavy) return

        const now = this.time.now
        const lastShellAt = this.lastShellAtByOwner.get(bullet.ownerId) ?? -1000
        if (now - lastShellAt < 80) return
        this.lastShellAtByOwner.set(bullet.ownerId, now)

        const shooter = this.playerViews.get(bullet.ownerId)
        const startX = shooter ? shooter.root.x + Math.cos(bullet.angle) * 14 : bullet.x
        const startY = shooter ? shooter.root.y + WEAPON_BASE_Y + Math.sin(bullet.angle) * 14 : bullet.y
        const facingLeft = bullet.angle > Math.PI / 2 || bullet.angle < -Math.PI / 2
        const sideDir = facingLeft ? 1 : -1

        const isShotgun = weaponType === 'shotgun'
        const shellKey = isShotgun ? 'shell-shotgun' : 'shell-small'
        const shellSize = isShotgun ? SHELL_SHOTGUN_SIZE : SHELL_SMALL_SIZE

        const shell = this.add
            .image(startX, startY, shellKey)
            .setDisplaySize(shellSize, shellSize)
            .setDepth(startY + 2)

        const landX = startX + sideDir * Phaser.Math.Between(12, 20)
        const peakY = startY - Phaser.Math.Between(10, 16)
        const groundY = (shooter ? shooter.root.y : bullet.y) + Phaser.Math.Between(4, 10)
        const spin = sideDir * Phaser.Math.Between(140, 240)

        this.tweens.add({
            targets: shell,
            x: (startX + landX) / 2,
            y: peakY,
            angle: spin * 0.5,
            duration: 140,
            ease: 'Quad.easeOut',
            onComplete: () => {
                if (!shell.scene) return
                this.tweens.add({
                    targets: shell,
                    x: landX,
                    y: groundY,
                    angle: spin,
                    duration: 200,
                    ease: 'Bounce.easeOut',
                    onComplete: () => {
                        if (!shell.scene) return
                        this.tweens.add({
                            targets: shell,
                            alpha: 0,
                            delay: 220,
                            duration: 200,
                            onComplete: () => shell.destroy(),
                        })
                    },
                })
            },
        })
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
            const teamColor: TeamColor =
                player.teamColor === 'blue' || skin === 'mouse' || skin === 'rabbit' ? 'blue' : 'orange'
            const weaponType: WeaponType = WEAPON_TYPES.includes(player.weaponType)
                ? player.weaponType
                : 'rifle'

            let view = this.playerViews.get(player.id)

            if (!view) {
                view = this.createPlayerView(
                    player.name,
                    player.x,
                    player.y,
                    player.hp ?? 100,
                    skin,
                    teamColor,
                    weaponType,
                )
                this.playerViews.set(player.id, view)
            } else {
                if (player.x !== view.lastX || player.y !== view.lastY) {
                    view.lastX = player.x
                    view.lastY = player.y
                    view.lastMovedAt = this.time.now
                }

                if (view.weaponType !== weaponType || view.teamColor !== teamColor) {
                    const prevWeapon = view.weaponType
                    const switchedToMeleeOutOfAmmo =
                        player.id === this.controls.playerId &&
                        !MELEE_WEAPONS.has(prevWeapon) &&
                        MELEE_WEAPONS.has(weaponType) &&
                        (player.ammo ?? 0) <= 0
                    const pickedUp = prevWeapon !== weaponType && !switchedToMeleeOutOfAmmo && weaponType !== 'rifle'

                    view.weaponType = weaponType
                    view.teamColor = teamColor
                    view.weapon.setTexture(`weapon-${weaponType}-${teamColor}`)
                    if (MELEE_WEAPONS.has(weaponType)) {
                        view.weapon.setOrigin(0.5, 0.85)
                    } else {
                        view.weapon.setOrigin(0.2, 0.5)
                    }
                    if (switchedToMeleeOutOfAmmo) {
                        this.playSound('error-a', 0.45)
                    } else if (pickedUp) {
                        this.playSound('coin-a', 0.45)
                    }
                }

                const seq = player.meleeAttackSeq ?? 0
                if (seq > view.lastMeleeSeq) {
                    view.lastMeleeSeq = seq
                    this.playSound('shoot-f', 0.4)
                    this.playMeleeSlash(
                        view,
                        player.lastMeleeAngle ?? player.aimAngle,
                        weaponType,
                        teamColor,
                    )
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
                this.playSound(player.id === this.controls.playerId ? 'lose-c' : 'hurt-d', 0.5)
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

            if (view.isDead) {
                if (view.emoteSprite.texture.key !== 'emote-skull') {
                    view.emoteSprite.setTexture('emote-skull')
                }
                view.emoteSprite.setVisible(true)
                if (!wasDead) {
                    this.tweens.killTweensOf(view.emoteSprite)
                    view.emoteSprite.setY(-44)
                    this.tweens.add({
                        targets: view.emoteSprite,
                        y: -54,
                        duration: 420,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut',
                    })
                }
            } else {
                if (wasDead) {
                    this.tweens.killTweensOf(view.emoteSprite)
                    view.emoteSprite.setY(EMOTE_OFFSET_Y)
                }
                if (player.emote === 'dots' || player.emote === 'alert') {
                    const emoteKey = `emote-${player.emote}`
                    if (view.emoteSprite.texture.key !== emoteKey) {
                        view.emoteSprite.setTexture(emoteKey)
                    }
                    view.emoteSprite.setVisible(true)
                } else {
                    view.emoteSprite.setVisible(false)
                }
            }

            const deadKey = `player-${view.skin}-dead`
            if (view.isDead) {
                if (view.body.anims.isPlaying) view.body.anims.stop()
                if (view.body.texture.key !== deadKey) {
                    view.body.setTexture(deadKey)
                }
                view.weapon.setVisible(false)
                view.hpBarFrame.setVisible(false)
                view.hpBarFill.setVisible(false)
                continue
            }

            view.weapon.setVisible(true)
            view.hpBarFrame.setVisible(true)
            view.hpBarFill.setVisible(true)

            const hpRatio = Math.max(0, Math.min(1, (player.hp ?? 100) / 100))
            view.hpBarFill.setCrop(0, 0, Math.round(192 * hpRatio), 64)

            const weaponX = Math.cos(player.aimAngle) * WEAPON_RADIAL_OFFSET
            const weaponY = WEAPON_BASE_Y + Math.sin(player.aimAngle) * WEAPON_RADIAL_OFFSET
            view.weapon.setPosition(weaponX, weaponY)
            if (MELEE_WEAPONS.has(weaponType)) {
                view.weapon.setFlipX(facingLeft)
                view.weapon.setFlipY(false)
                if (!view.isSwinging) {
                    const guardTilt = facingLeft ? 0.35 : -0.35
                    view.weapon.setRotation(player.aimAngle + Math.PI / 2 + guardTilt)
                }
            } else {
                view.weapon.setFlipX(false)
                view.weapon.setRotation(player.aimAngle)
                view.weapon.setFlipY(facingLeft)
            }
            view.weapon.setDepth((isLocal ? player.y : view.root.y) + 1)
        }
    }

    private playMeleeSlash(
        view: PlayerView,
        attackAngle: number,
        weaponType: WeaponType,
        teamColor: TeamColor,
    ) {
        view.isSwinging = true
        this.tweens.killTweensOf(view.weapon)

        const facingLeft = attackAngle > Math.PI / 2 || attackAngle < -Math.PI / 2
        const baseAngle = attackAngle + Math.PI / 2
        const dir = facingLeft ? -1 : 1
        const startAngle = baseAngle - dir * Phaser.Math.DegToRad(65)
        const endAngle = baseAngle + dir * Phaser.Math.DegToRad(75)
        view.weapon.setFlipX(facingLeft)
        view.weapon.setRotation(startAngle)

        this.tweens.add({
            targets: view.weapon,
            rotation: endAngle,
            duration: 140,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                view.isSwinging = false
            },
        })

        const radius = weaponType === 'axe' ? 68 : 48
        const arcHalf = Phaser.Math.DegToRad(weaponType === 'axe' ? 68 : 52)
        const slashColor = teamColor === 'blue' ? 0x93c5fd : 0xfdba74
        const slash = this.add.graphics().setDepth(view.root.y + 3)
        slash.lineStyle(5, 0xffffff, 0.85)
        slash.beginPath()
        slash.arc(view.root.x, view.root.y + WEAPON_BASE_Y, radius, attackAngle - arcHalf, attackAngle + arcHalf, false)
        slash.strokePath()
        slash.lineStyle(10, slashColor, 0.45)
        slash.beginPath()
        slash.arc(view.root.x, view.root.y + WEAPON_BASE_Y, radius - 4, attackAngle - arcHalf, attackAngle + arcHalf, false)
        slash.strokePath()

        this.tweens.add({
            targets: slash,
            alpha: 0,
            duration: 130,
            onComplete: () => slash.destroy(),
        })
    }

    private createPlayerView(
        name: string,
        x: number,
        y: number,
        hp: number,
        skin: PlayerSkin,
        teamColor: TeamColor,
        weaponType: WeaponType,
    ): PlayerView {
        const body = this.add
            .sprite(0, 0, `player-${skin}-idle`)
            .setDisplaySize(PLAYER_DISPLAY_SIZE, PLAYER_DISPLAY_SIZE)
            .setOrigin(0.5, 0.85)

        const isMelee = MELEE_WEAPONS.has(weaponType)
        const weapon = this.add
            .image(0, WEAPON_BASE_Y, `weapon-${weaponType}-${teamColor}`)
            .setDisplaySize(WEAPON_DISPLAY_SIZE, WEAPON_DISPLAY_SIZE)
            .setOrigin(isMelee ? 0.5 : 0.2, isMelee ? 0.85 : 0.5)

        const hpBarFillKey = teamColor === 'blue' ? 'hp-bar-fill-blue' : 'hp-bar-fill'
        const hpBarFill = this.add
            .image(0, HP_BAR_Y, hpBarFillKey)
            .setDisplaySize(HP_BAR_WIDTH, HP_BAR_HEIGHT)

        const hpBarFrame = this.add
            .image(0, HP_BAR_Y, 'hp-bar-frame')
            .setDisplaySize(HP_BAR_WIDTH, HP_BAR_HEIGHT)

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

        const root = this.add.container(x, y, [
            body,
            weapon,
            hpBarFill,
            hpBarFrame,
            label,
            emoteSprite,
        ])
        return {
            root,
            body,
            weapon,
            emoteSprite,
            hpBarFrame,
            hpBarFill,
            skin,
            teamColor,
            weaponType,
            isDead: false,
            lastHp: hp,
            lastMeleeSeq: 0,
            isSwinging: false,
            targetX: x,
            targetY: y,
            lastX: x,
            lastY: y,
            lastMovedAt: -WALK_ANIM_TIMEOUT_MS,
        }
    }
}
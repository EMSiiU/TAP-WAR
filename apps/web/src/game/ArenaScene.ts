import Phaser from 'phaser'
import { isSafeCustomEmoteDataUrl } from '../auth/customEmote'
import {
    PLAYER_HITBOX_OFFSET_Y,
    POWERUP_META,
    buildMapLayers,
    getArenaMap,
    isBulletHittingObstacle,
    segmentBlockedByObstacle,
    type ArenaMapConfig,
    type GameMode,
    type MapEnvironment,
    type MapSize,
    type PowerUpKind,
} from './arenaMaps'
import { findAutoAimAngle } from './autoAim'
import { createGamepadEdgeDetector, pickActiveGamepad, readGamepadInput } from './gamepad'
import { DEFAULT_PC_CONTROLS, type PcControlConfig } from './keybindings'
import { LocalPlayerPredictor } from './prediction'
import type { TouchInputState } from './touchInput'

export type MatchPhase = 'waiting' | 'playing' | 'finished'
export type PlayerSkin = 'fox' | 'squirrel' | 'mouse' | 'rabbit'
export type TeamColor = 'orange' | 'blue'
export type MeleeWeaponType = 'knife' | 'axe'
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
    team?: TeamColor | ''
    weaponType: WeaponType
    ammo?: number
    maxAmmo?: number
    reserveAmmo?: number
    isReloading?: boolean
    reloadProgress?: number
    lastMeleeWeapon?: 'knife' | 'axe'
    hp: number
    shield?: number
    shieldRemaining?: number
    shieldProgress?: number
    goldenRemaining?: number
    dashes?: number
    maxDashes?: number
    dashRechargeProgress?: number
    dashSeq?: number
    dashAngle?: number
    weaponTier?: number
    kills: number
    deaths: number
    isDead: boolean
    isBot?: boolean
    hasCustomEmote?: boolean
    emote: string
    meleeAttackSeq?: number
    lastMeleeAngle?: number
    lastInputSeq?: number
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

export type PowerUpState = {
    id: string
    kind: PowerUpKind
    x: number
    y: number
}

export type ArenaWorldSnapshot = {
    players: PlayerState[]
    bullets: BulletState[]
    pickups: PickupState[]
    powerUps: PowerUpState[]
}

export type CrosshairStyle = 'outline' | 'plain'
export type ArenaActionKind = 'melee' | 'reload' | 'dash' | 'touchSync'

export type ArenaControls = {
    playerId: string
    send: (input: {
        moveX: number
        moveY: number
        aimAngle: number
        shoot?: boolean
        melee?: boolean
        reload?: boolean
        dash?: boolean
        seq?: number
    }) => void
    sendEmote?: (emote: 'dots' | 'alert' | 'custom') => void
    sendPause?: (paused: boolean) => void
}

const INPUT_INTERVAL_MS = 50
const MINIMAP_INTERVAL_MS = 66
const SFX_MIN_INTERVAL_MS = 35
const WALK_ANIM_TIMEOUT_MS = 120
const PLAYER_DISPLAY_SIZE = 80
const WEAPON_DISPLAY_SIZE = 68
const WEAPON_BASE_Y = -10
const WEAPON_RADIAL_OFFSET = 15
const SMALL_BULLET_BASE_SIZE = 18
const HEAVY_BULLET_BASE_SIZE = 16
const SHELL_SMALL_SIZE = 14
const SHELL_SHOTGUN_SIZE = 16
const PICKUP_DISPLAY_SIZE = 44
const POWERUP_DISPLAY_SIZE = 34
const EMOTE_DISPLAY_SIZE = 32
const CUSTOM_EMOTE_DISPLAY_SIZE = 38
const EMOTE_OFFSET_Y = -110
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
const POWERUP_KINDS: PowerUpKind[] = ['ammo', 'medkit', 'shield', 'dash', 'golden']
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
    teamRing: Phaser.GameObjects.Ellipse
    auraRing: Phaser.GameObjects.Arc
    body: Phaser.GameObjects.Sprite
    weapon: Phaser.GameObjects.Image
    emoteSprite: Phaser.GameObjects.Image
    hpBarFrame: Phaser.GameObjects.Image
    hpBarFill: Phaser.GameObjects.Image
    shieldBarBg: Phaser.GameObjects.Rectangle
    shieldBarFill: Phaser.GameObjects.Rectangle
    reloadBarBg: Phaser.GameObjects.Rectangle
    reloadBarFill: Phaser.GameObjects.Rectangle
    label: Phaser.GameObjects.Text
    skin: PlayerSkin
    teamColor: TeamColor
    team: TeamColor | ''
    weaponType: WeaponType
    isDead: boolean
    isBot: boolean
    lastHp: number
    lastShield: number
    lastGolden: number
    lastDashes: number
    lastReserveAmmo: number
    lastReloading: boolean
    lastAmmo: number
    lastMeleeSeq: number
    lastDashSeq: number
    isSwinging: boolean
    targetX: number
    targetY: number
    lastX: number
    lastY: number
    lastMovedAt: number
    renderedHpRatio: number
    renderedShieldProgress: number
    renderedShieldBarMode: 'none' | 'shield' | 'golden'
    renderedAuraMode: 'none' | 'shield' | 'golden'
    renderedReloadProgress: number
    renderedReloading: boolean
}

type BulletView = {
    sprite: Phaser.GameObjects.Image
    x: number
    y: number
    vx: number
    vy: number
    weaponType: WeaponType
    lastTrailAt: number
    stopped: boolean
}

type PickupView = {
    root: Phaser.GameObjects.Container
    sprite: Phaser.GameObjects.Image
}

type PowerUpView = {
    root: Phaser.GameObjects.Container
    sprite: Phaser.GameObjects.Image
    kind: PowerUpKind
}

export default class ArenaScene extends Phaser.Scene {
    private players: PlayerState[] = []
    private playerById = new Map<string, PlayerState>()
    private bullets: BulletState[] = []
    private pickups: PickupState[] = []
    private powerUps: PowerUpState[] = []
    private currentPhase: MatchPhase = 'waiting'
    private gameMode: GameMode = 'ffa'
    private crosshairStyle: CrosshairStyle = 'outline'
    private pcControls: PcControlConfig = { ...DEFAULT_PC_CONTROLS }
    private isPaused = false
    private touchMode = false
    private arenaMap: ArenaMapConfig
    private localPredictor: LocalPlayerPredictor
    private localDashGraceUntil = 0
    private liveControl = {
        sentSeq: 0,
        sentMoveX: 0,
        sentMoveY: 0,
    }
    private sampleLiveControl?: () => { moveX: number; moveY: number; aimAngle: number }
    private getTouchInput?: () => TouchInputState
    private onMenuToggle?: () => void
    private onPracticeArsenalToggle?: () => void
    private onGamepadChange?: (connected: boolean) => void
    private aimOffsetX = 120
    private aimOffsetY = 0
    private playerViews = new Map<string, PlayerView>()
    private bulletViews = new Map<string, BulletView>()
    private pickupViews = new Map<string, PickupView>()
    private powerUpViews = new Map<string, PowerUpView>()
    private activePlayerIds = new Set<string>()
    private activeBulletIds = new Set<string>()
    private activePickupIds = new Set<string>()
    private activePowerUpIds = new Set<string>()
    private customEmoteDataUrls = new Map<string, string>()
    private customEmoteLoadedKeys = new Set<string>()
    private lastShellAtByOwner = new Map<string, number>()
    private lastSoundAtByKey = new Map<string, number>()
    private lastEmptyClickAt = 0
    private aimCrosshair?: Phaser.GameObjects.Image
    private aimGuideGraphics?: Phaser.GameObjects.Graphics
    private minimapStaticGraphics?: Phaser.GameObjects.Graphics
    private minimapGraphics?: Phaser.GameObjects.Graphics
    private lastMinimapDrawAt = -1000
    private isReady = false

    private controls: ArenaControls
    private cleanupControls?: () => void
    private dispatchAction?: (action: ArenaActionKind) => void

    constructor(
        controls: ArenaControls,
        mapSize: MapSize = 'small',
        touchMode = false,
        getTouchInput?: () => TouchInputState,
        onMenuToggle?: () => void,
        onGamepadChange?: (connected: boolean) => void,
        environment: MapEnvironment = 'desert',
    ) {
        super('arena')
        this.controls = controls
        this.arenaMap = getArenaMap(mapSize, environment)
        this.localPredictor = new LocalPlayerPredictor(this.arenaMap)
        this.touchMode = touchMode
        this.getTouchInput = getTouchInput
        this.onMenuToggle = onMenuToggle
        this.onGamepadChange = onGamepadChange
    }

    preload() {
        this.load.image('tilemap-desert', '/assets/maps/tilemap-desert.png')
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
        for (const kind of POWERUP_KINDS) {
            this.load.svg(`powerup-${kind}`, `/assets/ui/powerup-${kind}.svg`, {
                width: 40,
                height: 40,
            })
        }
        this.load.image('bullet-small', '/assets/characters/bullet-small.png')
        this.load.image('bullet-heavy', '/assets/characters/bullet-heavy.png')
        this.load.image('bullet-plasma', '/assets/characters/bullet-plasma.png')
        this.load.image('shell-small', '/assets/characters/shell-small.png')
        this.load.image('shell-shotgun', '/assets/characters/shell-shotgun.png')
        this.load.image('hp-bar-frame', '/assets/ui/hp-bar-frame.png')
        this.load.image('hp-bar-fill', '/assets/ui/hp-bar-fill.png')
        this.load.image('hp-bar-fill-blue', '/assets/ui/hp-bar-fill-blue.png')
        this.load.svg('emote-dots', '/assets/ui/emote-laugh.svg', { width: 32, height: 32 })
        this.load.svg('emote-alert', '/assets/ui/emote-heart.svg', { width: 32, height: 32 })
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
        this.load.audio('coin-b', '/assets/sounds/coin-b.ogg')
        this.load.audio('coin-c', '/assets/sounds/coin-c.ogg')
        this.load.audio('jump-a', '/assets/sounds/jump-a.ogg')
        this.load.audio('move-a', '/assets/sounds/move-a.ogg')
        this.load.audio('fall-a', '/assets/sounds/fall-a.ogg')
        this.load.audio('error-a', '/assets/sounds/error-a.ogg')
    }

    create() {
        this.isReady = true
        this.input.setDefaultCursor(this.touchMode ? 'default' : 'none')
        this.input.mouse?.disableContextMenu()
        this.cameras.main.setBounds(0, 0, this.arenaMap.width, this.arenaMap.height)

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.isReady = false
            this.input.setDefaultCursor('default')
            if (document.pointerLockElement === this.game.canvas) {
                document.exitPointerLock?.()
            }
            this.stopControls()
            this.onPracticeArsenalToggle = undefined
            this.aimCrosshair?.destroy()
            this.aimCrosshair = undefined
            this.aimGuideGraphics?.destroy()
            this.aimGuideGraphics = undefined
            this.minimapStaticGraphics?.destroy()
            this.minimapStaticGraphics = undefined
            this.minimapGraphics?.destroy()
            this.minimapGraphics = undefined
            this.playerViews.clear()
            this.playerById.clear()
            this.bulletViews.clear()
            this.pickupViews.clear()
            this.powerUpViews.clear()
            this.lastShellAtByOwner.clear()
            this.lastSoundAtByKey.clear()
            for (const key of this.customEmoteLoadedKeys) {
                if (this.textures.exists(key)) this.textures.remove(key)
            }
            this.customEmoteLoadedKeys.clear()
        })

        this.renderArenaMap()

        this.aimGuideGraphics = this.add.graphics().setDepth(9200)
        this.minimapStaticGraphics = this.add.graphics().setScrollFactor(0).setDepth(9499)
        this.minimapGraphics = this.add.graphics().setScrollFactor(0).setDepth(9500)
        this.renderMinimapBackground()
        this.lastMinimapDrawAt = -1000

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
        this.applyPowerUps(this.powerUps)
        for (const [sessionId, dataUrl] of this.customEmoteDataUrls) {
            this.loadCustomEmoteTexture(sessionId, dataUrl)
        }
        if (this.arenaMap.id !== 'small') {
            const localView = this.playerViews.get(this.controls.playerId)
            if (localView) {
                this.cameras.main.centerOn(localView.root.x, localView.root.y)
            }
        }
        this.startControls()
    }

    private renderArenaMap() {
        const { ground: groundData, solids: obstacleData } = buildMapLayers(this.arenaMap)

        const groundMap = this.make.tilemap({ data: groundData, tileWidth: 16, tileHeight: 16 })
        const groundTiles = groundMap.addTilesetImage('tilemap-desert', 'tilemap-desert', 16, 16, 0, 0)
        if (groundTiles) {
            groundMap.createLayer(0, groundTiles, 0, 0)?.setScale(2).setCullPadding(2, 2)
        }

        const obsMap = this.make.tilemap({ data: obstacleData, tileWidth: 16, tileHeight: 16 })
        const obsTiles = obsMap.addTilesetImage('tilemap-desert', 'tilemap-desert', 16, 16, 0, 0)
        if (obsTiles) {
            obsMap.createLayer(0, obsTiles, 0, 0)?.setScale(2).setCullPadding(2, 2)
        }

        const edges = this.add.graphics().setDepth(1)
        const industrial = this.arenaMap.environment === 'industrial'
        for (const obstacle of this.arenaMap.obstacles) {
            edges.lineStyle(4, industrial ? 0x303244 : 0x624653, 0.95)
            edges.strokeRect(obstacle.x + 2, obstacle.y + 2, obstacle.width - 4, obstacle.height - 4)
            edges.lineStyle(6, industrial ? 0x36364c : 0x624653, 0.7)
            edges.lineBetween(
                obstacle.x + 5,
                obstacle.y + obstacle.height - 5,
                obstacle.x + obstacle.width - 5,
                obstacle.y + obstacle.height - 5,
            )
            if (industrial && obstacle.width > 32 && obstacle.height > 32) {
                for (let x = obstacle.x + 8; x < obstacle.x + obstacle.width - 8; x += 24) {
                    edges.fillStyle(0xf2c46d, 0.9)
                    edges.fillRect(x, obstacle.y + obstacle.height - 12, 12, 4)
                }
            }
        }

        const labelY = this.arenaMap.height * 0.12
        const names = industrial ? ['ALMACÉN OESTE', 'ALMACÉN ESTE'] : ['CANTERA OESTE', 'CANTERA ESTE']
        for (let index = 0; index < names.length; index++) {
            this.add
                .text(this.arenaMap.width * (index ? 0.75 : 0.25), labelY, names[index], {
                    fontFamily: 'monospace',
                    fontSize: '20px',
                    color: industrial ? '#e3d9bf' : '#6d4850',
                    backgroundColor: industrial ? '#55516b' : '#e4b88e',
                    padding: { x: 10, y: 5 },
                })
                .setOrigin(0.5)
                .setDepth(1)
        }
    }

    update(time: number, delta: number) {
        const interpFactor = 1 - Math.pow(1 - 0.25, delta / 16.667)
        const dtSec = Math.min(delta / 1000, 0.1)

        for (const [id, view] of this.playerViews) {
            if (id === this.controls.playerId) {
                if (!view.isDead && !this.isPaused && this.currentPhase !== 'finished') {
                    if (time < this.localDashGraceUntil) {
                        const dashFactor = 1 - Math.pow(1 - 0.45, delta / 16.667)
                        const nextX = Phaser.Math.Linear(view.root.x, view.targetX, dashFactor)
                        const nextY = Phaser.Math.Linear(view.root.y, view.targetY, dashFactor)
                        view.root.setPosition(nextX, nextY)
                        view.root.setDepth(nextY)
                        view.body.setDepth(nextY)
                        view.weapon.setDepth(nextY + 1)
                        this.localPredictor.reset(nextX, nextY)
                        view.lastMovedAt = time
                    } else if (this.sampleLiveControl) {
                        const live = this.sampleLiveControl()
                        if (live.moveX !== 0 || live.moveY !== 0) {
                            view.lastMovedAt = time
                        }
                        const tagSeq =
                            live.moveX === this.liveControl.sentMoveX &&
                            live.moveY === this.liveControl.sentMoveY
                                ? this.liveControl.sentSeq
                                : this.liveControl.sentSeq + 1
                        const pos = this.localPredictor.stepFrame(
                            live.moveX,
                            live.moveY,
                            dtSec,
                            tagSeq,
                            true,
                        )
                        view.root.setPosition(pos.x, pos.y)
                        view.root.setDepth(pos.y)
                        view.body.setDepth(pos.y)
                        view.weapon.setDepth(pos.y + 1)

                        const facingLeft = live.aimAngle > Math.PI / 2 || live.aimAngle < -Math.PI / 2
                        view.body.setFlipX(facingLeft)
                        const weaponX = Math.cos(live.aimAngle) * WEAPON_RADIAL_OFFSET
                        const weaponY = WEAPON_BASE_Y + Math.sin(live.aimAngle) * WEAPON_RADIAL_OFFSET
                        view.weapon.setPosition(weaponX, weaponY)
                        if (MELEE_WEAPONS.has(view.weaponType)) {
                            view.weapon.setFlipX(facingLeft)
                            view.weapon.setFlipY(false)
                            if (!view.isSwinging) {
                                const guardTilt = facingLeft ? 0.35 : -0.35
                                view.weapon.setRotation(live.aimAngle + Math.PI / 2 + guardTilt)
                            }
                        } else {
                            view.weapon.setFlipX(false)
                            view.weapon.setRotation(live.aimAngle)
                            view.weapon.setFlipY(facingLeft)
                        }
                    }
                }
            } else {
                const nextX = Phaser.Math.Linear(view.root.x, view.targetX, interpFactor)
                const nextY = Phaser.Math.Linear(view.root.y, view.targetY, interpFactor)
                view.root.setPosition(nextX, nextY)
                view.root.setDepth(nextY)
                view.body.setDepth(nextY)
                view.weapon.setDepth(nextY + 1)
            }

            if (view.auraRing.visible) {
                const pulse = 1 + Math.sin(time / 120) * 0.08
                view.auraRing.setScale(pulse)
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

        if (this.arenaMap.id !== 'small') {
            const localView = this.playerViews.get(this.controls.playerId)
            if (localView) {
                this.cameras.main.centerOn(localView.root.x, localView.root.y)
            }
        }

        if (this.currentPhase !== 'finished') {
            for (const bv of this.bulletViews.values()) {
                if (bv.stopped) continue
                const prevX = bv.x
                const prevY = bv.y
                const nextX = prevX + bv.vx * dtSec
                const nextY = prevY + bv.vy * dtSec

                if (
                    nextX < 0 ||
                    nextX > this.arenaMap.width ||
                    nextY < 0 ||
                    nextY > this.arenaMap.height ||
                    isBulletHittingObstacle(nextX, nextY, 4, this.arenaMap) ||
                    segmentBlockedByObstacle(prevX, prevY, nextX, nextY, this.arenaMap)
                ) {
                    bv.stopped = true
                    bv.sprite.setVisible(false)
                    continue
                }

                bv.x = nextX
                bv.y = nextY
                bv.sprite.setPosition(nextX, nextY)
                bv.sprite.setDepth(nextY + 2)

                if (
                    bv.weaponType === 'launcher' &&
                    time - bv.lastTrailAt >= 55 &&
                    this.isNearViewport(nextX, nextY, 80)
                ) {
                    bv.lastTrailAt = time
                    const trail = this.add.circle(nextX, nextY, 4, 0xfb923c, 0.55).setDepth(nextY + 1)
                    this.tweens.add({
                        targets: trail,
                        scale: 1.9,
                        alpha: 0,
                        duration: 140,
                        onComplete: () => trail.destroy(),
                    })
                }
            }
        }

        this.renderMinimap(time)
        this.renderTouchAimGuide(time)
        this.updateCrosshair()
    }

    private isNearViewport(x: number, y: number, margin = 140): boolean {
        if (this.arenaMap.id === 'small') return true
        const cam = this.cameras?.main
        if (!cam) return true
        const view = cam.worldView
        if (!view || view.width === 0 || view.height === 0) return true
        return (
            x >= view.left - margin &&
            x <= view.right + margin &&
            y >= view.top - margin &&
            y <= view.bottom + margin
        )
    }

    private playSpatialSound(
        key: string,
        baseVolume: number,
        x: number,
        y: number,
        maxDist = 900,
        isLocal = false,
    ) {
        if (!this.isReady || this.sound.locked || !this.cache.audio.exists(key)) return
        if (isLocal || this.arenaMap.id === 'small') {
            this.playSound(key, baseVolume)
            return
        }

        const now = this.time.now
        const lastAt = this.lastSoundAtByKey.get(key) ?? -1000
        if (now - lastAt < SFX_MIN_INTERVAL_MS) return

        const localView = this.playerViews.get(this.controls.playerId)
        const localPlayer = this.playerById.get(this.controls.playerId)
        const lx = localView ? localView.root.x : localPlayer?.x
        const ly = localView ? localView.root.y : localPlayer?.y
        let volume = baseVolume
        if (lx !== undefined && ly !== undefined) {
            const dist = Math.hypot(x - lx, y - ly)
            if (dist > maxDist) return
            volume = baseVolume * Math.max(0.18, 1 - dist / maxDist)
        }
        this.lastSoundAtByKey.set(key, now)
        this.sound.play(key, { volume })
    }

    private getMinimapBounds() {
        const mmW = this.arenaMap.id === 'small' ? 132 : 156
        const mmH = Math.round((mmW * this.arenaMap.height) / this.arenaMap.width)
        const mmX = 1024 - mmW - 12
        const mmY = 12
        const scaleX = mmW / this.arenaMap.width
        const scaleY = mmH / this.arenaMap.height
        return { mmW, mmH, mmX, mmY, scaleX, scaleY }
    }

    private renderMinimapBackground() {
        const g = this.minimapStaticGraphics
        if (!g) return
        const { mmW, mmH, mmX, mmY, scaleX, scaleY } = this.getMinimapBounds()

        g.clear()
        g.fillStyle(0x1e1629, 0.76)
        g.fillRoundedRect(mmX, mmY, mmW, mmH, 6)
        g.lineStyle(2, 0xf5e2cb, 0.72)
        g.strokeRoundedRect(mmX, mmY, mmW, mmH, 6)

        g.fillStyle(0x8d6e63, 0.9)
        for (const obs of this.arenaMap.obstacles) {
            g.fillRect(
                mmX + obs.x * scaleX,
                mmY + obs.y * scaleY,
                Math.max(2, obs.width * scaleX),
                Math.max(2, obs.height * scaleY),
            )
        }
    }

    private renderTouchAimGuide(time: number) {
        const g = this.aimGuideGraphics
        if (!g) return
        g.clear()

        if (!this.touchMode || this.isPaused || this.currentPhase === 'finished') return
        const touch = this.getTouchInput?.()
        if (!touch?.aimActive) return

        const localPlayer = this.playerById.get(this.controls.playerId)
        if (!localPlayer || localPlayer.isDead) return
        const localView = this.playerViews.get(this.controls.playerId)
        const baseX = localView ? localView.root.x : localPlayer.x
        const baseY = localView ? localView.root.y : localPlayer.y

        const startX = baseX
        const startY = baseY + WEAPON_BASE_Y

        if (touch.aimMode === 'manual') {
            const cancelling = touch.aimCancelling
            const beamLen = cancelling ? 60 : Math.max(130, touch.aimMagnitude * MAX_AIM_RADIUS)
            const endX = startX + Math.cos(touch.aimAngle) * beamLen
            const endY = startY + Math.sin(touch.aimAngle) * beamLen
            const color = cancelling ? 0x94a3b8 : touch.shoot ? 0xf97316 : 0xfef08a

            g.lineStyle(12, color, cancelling ? 0.14 : 0.22)
            g.lineBetween(startX, startY, endX, endY)
            g.lineStyle(3, color, cancelling ? 0.45 : 0.88)
            g.lineBetween(startX, startY, endX, endY)
            g.fillStyle(color, cancelling ? 0.5 : 0.92)
            g.fillCircle(endX, endY, cancelling ? 4 : 6)
        } else if (touch.aimMode === 'auto') {
            const aimSource =
                baseX === localPlayer.x && baseY === localPlayer.y
                    ? localPlayer
                    : { ...localPlayer, x: baseX, y: baseY }
            const { angle, target } = findAutoAimAngle(aimSource, this.players, this.gameMode, localPlayer.aimAngle, WEAPON_BASE_Y)
            if (target) {
                const pulse = 1 + Math.sin(time / 90) * 0.12
                g.lineStyle(2.5, 0xfacc15, 0.55)
                g.lineBetween(startX, startY, target.x, target.y)
                g.lineStyle(3, 0xfef08a, 0.9)
                g.strokeCircle(target.x, target.y - 16, 26 * pulse)
            } else {
                const endX = startX + Math.cos(angle) * 140
                const endY = startY + Math.sin(angle) * 140
                g.lineStyle(3, 0xfacc15, 0.55)
                g.lineBetween(startX, startY, endX, endY)
            }
        }
    }

    private renderMinimap(time: number) {
        const g = this.minimapGraphics
        if (!g) return
        if (time - this.lastMinimapDrawAt < MINIMAP_INTERVAL_MS) return
        this.lastMinimapDrawAt = time

        const { mmX, mmY, scaleX, scaleY } = this.getMinimapBounds()

        g.clear()
        g.fillStyle(0xfbbf24, 0.8)
        for (const pickup of this.pickups) {
            g.fillCircle(mmX + pickup.x * scaleX, mmY + pickup.y * scaleY, 2.2)
        }

        const pulse = (Math.sin(time / 140) + 1) / 2
        for (const powerUp of this.powerUps) {
            const px = mmX + powerUp.x * scaleX
            const py = mmY + powerUp.y * scaleY
            if (powerUp.kind === 'golden') {
                g.lineStyle(2.5, 0xfef08a, 0.55 + pulse * 0.45)
                g.strokeCircle(px, py, 5.5 + pulse * 4.5)
                g.fillStyle(0xfacc15, 1)
                g.fillCircle(px, py, 4.2)
                g.fillStyle(0xffffff, 0.95)
                g.fillCircle(px, py, 1.8)
            } else {
                const meta = POWERUP_META[powerUp.kind]
                g.fillStyle(meta.color, 0.95)
                g.fillCircle(px, py, 2.6)
            }
        }

        const localPlayer = this.playerById.get(this.controls.playerId)
        const localView = this.playerViews.get(this.controls.playerId)
        for (const player of this.players) {
            if (player.isDead) continue
            const isLocal = player.id === this.controls.playerId
            const isTeammate =
                !isLocal &&
                this.gameMode === 'tdm' &&
                Boolean(localPlayer?.team) &&
                player.team === localPlayer?.team
            const px = isLocal && localView ? localView.root.x : player.x
            const py = isLocal && localView ? localView.root.y : player.y
            const color = isLocal ? 0x38bdf8 : isTeammate ? 0x4ade80 : 0xf87171
            g.fillStyle(color, 1)
            g.fillCircle(mmX + px * scaleX, mmY + py * scaleY, isLocal ? 3.5 : 2.5)
            if (isLocal) {
                g.lineStyle(1.2, 0xffffff, 0.95)
                g.strokeCircle(mmX + px * scaleX, mmY + py * scaleY, 3.8)
            }
        }
    }

    setCrosshairStyle(style: CrosshairStyle) {
        this.crosshairStyle = style
    }

    setPcControls(pcControls: PcControlConfig) {
        this.pcControls = { ...pcControls }
    }

    setGameMode(mode: GameMode) {
        this.gameMode = mode
    }

    setTouchMode(enabled: boolean) {
        this.touchMode = enabled
        if (this.isReady) {
            this.input.setDefaultCursor(enabled ? 'default' : 'none')
            if (enabled && this.game?.canvas && document.pointerLockElement === this.game.canvas) {
                document.exitPointerLock?.()
            }
        }
    }

    setPaused(paused: boolean) {
        this.isPaused = paused
        if (paused && this.isReady && this.game?.canvas && document.pointerLockElement === this.game.canvas) {
            document.exitPointerLock?.()
        }
    }

    setPracticeArsenalToggle(handler?: () => void) {
        this.onPracticeArsenalToggle = handler
    }

    setPlayerCustomEmote(sessionId: string, dataUrl: string) {
        if (!sessionId || !isSafeCustomEmoteDataUrl(dataUrl)) return
        this.customEmoteDataUrls.set(sessionId, dataUrl)
        if (this.isReady && this.sys?.isActive() && this.textures) {
            this.loadCustomEmoteTexture(sessionId, dataUrl)
        }
    }

    private loadCustomEmoteTexture(sessionId: string, dataUrl: string) {
        if (!this.isReady || !this.textures || !isSafeCustomEmoteDataUrl(dataUrl)) return
        const key = `emote-custom-${sessionId}`
        const img = new Image()
        img.onload = () => {
            if (!this.isReady || !this.sys?.isActive() || !this.textures) return
            if (this.customEmoteDataUrls.get(sessionId) !== dataUrl) return
            if (this.textures.exists(key)) {
                this.textures.remove(key)
            }
            this.textures.addImage(key, img)
            this.customEmoteLoadedKeys.add(key)
        }
        img.src = dataUrl
    }

    triggerDamageFeedback(x: number, y: number, damage: number, blocked: boolean) {
        if (!this.isReady || !this.sys.isActive()) return
        const textValue = blocked ? 'ESCUDO' : `-${Math.max(1, Math.round(damage))}`
        const isHigh = damage >= 75
        const color = blocked ? '#7dd3fc' : isHigh ? '#facc15' : '#ffffff'
        const stroke = blocked ? '#0c4a6e' : isHigh ? '#7c2d12' : '#1e1b2e'
        const jitterX = Phaser.Math.Between(-10, 10)
        const label = this.add
            .text(x + jitterX, y - 56, textValue, {
                fontFamily: 'monospace',
                fontSize: isHigh || blocked ? '17px' : '15px',
                fontStyle: 'bold',
                color,
                stroke,
                strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(9400)

        this.tweens.add({
            targets: label,
            y: y - 90,
            alpha: 0,
            duration: 650,
            ease: 'Cubic.easeOut',
            onComplete: () => label.destroy(),
        })
    }

    resume() {
        this.isPaused = false
        this.controls.sendPause?.(false)
        if (!this.touchMode && this.currentPhase !== 'finished') {
            this.game.canvas.requestPointerLock?.()
        }
    }

    triggerAction(action: ArenaActionKind) {
        this.dispatchAction?.(action)
    }

    triggerExplosion(x: number, y: number, radius: number) {
        if (!this.isReady || !this.sys.isActive()) return
        this.playSpatialSound('explosion-a', 0.55, x, y, 1050)

        if (this.isNearViewport(x, y, radius + 120)) {
            // Blast radius zone fill (shows true AoE radius cleanly).
            const zone = this.add.circle(x, y, radius, 0xf97316, 0.32).setDepth(y + 10)
            zone.setStrokeStyle(4, 0xfef08a, 0.95)
            zone.setScale(0.25)
            this.tweens.add({
                targets: zone,
                scale: 1,
                alpha: 0,
                duration: 280,
                ease: 'Cubic.easeOut',
                onComplete: () => zone.destroy(),
            })

            // Expanding shockwave ring.
            const ring = this.add.circle(x, y, radius * 0.95, 0xfef08a, 0).setDepth(y + 11)
            ring.setStrokeStyle(6, 0xffffff, 0.9)
            ring.setScale(0.15)
            this.tweens.add({
                targets: ring,
                scale: 1.08,
                alpha: 0,
                duration: 240,
                ease: 'Quad.easeOut',
                onComplete: () => ring.destroy(),
            })

            // Bright fiery core flash.
            const core = this.add.circle(x, y, Math.max(24, radius * 0.36), 0xffffff, 0.95).setDepth(y + 12)
            this.tweens.add({
                targets: core,
                scale: 1.65,
                alpha: 0,
                duration: 180,
                ease: 'Quad.easeOut',
                onComplete: () => core.destroy(),
            })

            // Radial fiery sparks and smoke puffs.
            const sparkCount = 12
            const colors = [0xfef08a, 0xfb923c, 0xef4444, 0x78716c]
            for (let i = 0; i < sparkCount; i++) {
                const angle = (i / sparkCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.18, 0.18)
                const dist = radius * Phaser.Math.FloatBetween(0.55, 0.98)
                const spark = this.add
                    .circle(x, y, Phaser.Math.Between(5, 10), colors[i % colors.length], 0.95)
                    .setDepth(y + 13)
                this.tweens.add({
                    targets: spark,
                    x: x + Math.cos(angle) * dist,
                    y: y + Math.sin(angle) * dist,
                    scale: 0.2,
                    alpha: 0,
                    duration: Phaser.Math.Between(220, 360),
                    ease: 'Cubic.easeOut',
                    onComplete: () => spark.destroy(),
                })
            }
        }

        // Distance-scaled screen shake for impact punch.
        const localPlayer = this.playerById.get(this.controls.playerId)
        const localView = this.playerViews.get(this.controls.playerId)
        if (localPlayer || localView) {
            const lx = localView ? localView.root.x : localPlayer!.x
            const ly = localView ? localView.root.y : localPlayer!.y
            const distToLocal = Math.hypot(lx - x, ly - y)
            if (distToLocal < radius * 4) {
                const intensity = Math.max(0.002, 0.008 * (1 - distToLocal / (radius * 4)))
                this.cameras.main.shake(150, intensity)
            }
        }
    }

    private updateCrosshair() {
        if (!this.aimCrosshair) return

        const localPlayer = this.playerById.get(this.controls.playerId)
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

        const baseX = localView ? localView.root.x : localPlayer.x
        const baseY = localView ? localView.root.y : localPlayer.y
        this.aimCrosshair.setPosition(
            baseX + this.aimOffsetX,
            baseY + this.aimOffsetY,
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
        this.dispatchAction = undefined
        this.sampleLiveControl = undefined
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

    private playEmptyClickIfNeeded() {
        const local = this.playerById.get(this.controls.playerId)
        if (
            local &&
            this.currentPhase === 'playing' &&
            !MELEE_WEAPONS.has(local.weaponType) &&
            (local.ammo ?? 0) <= 0 &&
            (local.goldenRemaining ?? 0) <= 0 &&
            !local.isReloading &&
            this.time.now - this.lastEmptyClickAt > 320
        ) {
            this.lastEmptyClickAt = this.time.now
            this.playSound('error-a', 0.35)
        }
    }

    private startControls() {
        const pressedCodes = new Set<string>()
        const pressedMouse = new Set<string>()
        let pendingShot = false
        let pendingMelee = false
        let pendingReload = false
        let pendingDash = false
        let lastAutoShotSeq = this.getTouchInput?.()?.autoAimShotSeq ?? 0
        let lastManualShotSeq = this.getTouchInput?.()?.manualShotSeq ?? 0
        let aimAngle = 0
        let lastSentSeq = 0
        let lastSentMoveX = 0
        let lastSentMoveY = 0
        let lastSentAim = 0
        let lastSentShoot = false
        const detectGamepadEdges = createGamepadEdgeDetector()
        let lastReportedGamepad = false

        const isHeld = (binding: string) =>
            pressedCodes.has(binding) || (!this.touchMode && pressedMouse.has(binding))

        const reportGamepadState = (connected: boolean) => {
            if (connected !== lastReportedGamepad) {
                lastReportedGamepad = connected
                this.onGamepadChange?.(connected)
            }
        }

        reportGamepadState(Boolean(pickActiveGamepad(navigator.getGamepads?.())))

        const hasFocus = () => !document.hidden && (this.touchMode || document.hasFocus())

        const sampleAxesAndAim = (padSample: ReturnType<typeof readGamepadInput> | null) => {
            const player = this.playerById.get(this.controls.playerId)
            const localView = this.playerViews.get(this.controls.playerId)
            const touch = this.touchMode ? this.getTouchInput?.() : undefined

            if (touch) {
                if (touch.aimActive && touch.aimMode === 'auto' && player) {
                    const aimSource = localView
                        ? { ...player, x: localView.root.x, y: localView.root.y }
                        : player
                    const auto = findAutoAimAngle(
                        aimSource,
                        this.players,
                        this.gameMode,
                        aimAngle,
                        WEAPON_BASE_Y,
                        undefined,
                        PLAYER_HITBOX_OFFSET_Y,
                    )
                    aimAngle = auto.angle
                    this.aimOffsetX = Math.cos(aimAngle) * 140
                    this.aimOffsetY = WEAPON_BASE_Y + Math.sin(aimAngle) * 140
                } else if (touch.aimActive && touch.aimMode === 'manual') {
                    const aimRadius = Math.max(90, touch.aimMagnitude * MAX_AIM_RADIUS)
                    this.aimOffsetX = Math.cos(touch.aimAngle) * aimRadius
                    this.aimOffsetY = WEAPON_BASE_Y + Math.sin(touch.aimAngle) * aimRadius
                    aimAngle = touch.aimAngle
                } else if (padSample?.aimActive) {
                    const aimRadius = Math.max(110, padSample.aimMagnitude * MAX_AIM_RADIUS)
                    this.aimOffsetX = Math.cos(padSample.aimAngle) * aimRadius
                    this.aimOffsetY = WEAPON_BASE_Y + Math.sin(padSample.aimAngle) * aimRadius
                    aimAngle = padSample.aimAngle
                }
            } else if (padSample?.aimActive) {
                const aimRadius = Math.max(110, padSample.aimMagnitude * MAX_AIM_RADIUS)
                this.aimOffsetX = Math.cos(padSample.aimAngle) * aimRadius
                this.aimOffsetY = WEAPON_BASE_Y + Math.sin(padSample.aimAngle) * aimRadius
                aimAngle = padSample.aimAngle
            } else {
                const aimDy = this.aimOffsetY - WEAPON_BASE_Y
                if (this.aimOffsetX !== 0 || aimDy !== 0) {
                    const angle = Math.atan2(aimDy, this.aimOffsetX)
                    aimAngle = angle === Math.PI ? -Math.PI : angle
                }
            }

            const binds = this.pcControls
            const kbX = Number(isHeld(binds.moveRight)) - Number(isHeld(binds.moveLeft))
            const kbY = Number(isHeld(binds.moveDown)) - Number(isHeld(binds.moveUp))
            let moveX = kbX
            let moveY = kbY

            if (touch && (touch.moveX !== 0 || touch.moveY !== 0)) {
                moveX = touch.moveX
                moveY = touch.moveY
            } else if (padSample && (padSample.moveX !== 0 || padSample.moveY !== 0)) {
                moveX = padSample.moveX
                moveY = padSample.moveY
            }

            return { moveX, moveY, aimAngle, touch, player, localView }
        }

        this.sampleLiveControl = () => {
            if (!hasFocus() || this.isPaused || this.currentPhase === 'finished') {
                return { moveX: 0, moveY: 0, aimAngle }
            }
            const pad = pickActiveGamepad(navigator.getGamepads?.())
            const padSample = pad ? readGamepadInput(pad) : null
            const sampled = sampleAxesAndAim(padSample)
            return { moveX: sampled.moveX, moveY: sampled.moveY, aimAngle: sampled.aimAngle }
        }

        const sendInput = (force = false) => {
            const pad = pickActiveGamepad(navigator.getGamepads?.())
            reportGamepadState(Boolean(pad))
            const padSample = pad ? readGamepadInput(pad) : null
            const edges = detectGamepadEdges(padSample)

            if (edges.pausePressed && this.currentPhase !== 'finished') {
                this.onMenuToggle?.()
                return
            }

            if (this.isPaused || this.currentPhase === 'finished') return

            if (edges.emoteDotsPressed) {
                this.controls.sendEmote?.('dots')
            }
            if (edges.emoteAlertPressed) {
                this.controls.sendEmote?.('alert')
            }

            const sampled = sampleAxesAndAim(padSample)
            if (!sampled.player) return

            let touchBurstShot = false
            const { touch, player, localView } = sampled
            if (touch) {
                if (touch.autoAimShotSeq > lastAutoShotSeq) {
                    lastAutoShotSeq = touch.autoAimShotSeq
                    const aimSource = localView
                        ? { ...player, x: localView.root.x, y: localView.root.y }
                        : player
                    const auto = findAutoAimAngle(
                        aimSource,
                        this.players,
                        this.gameMode,
                        aimAngle,
                        WEAPON_BASE_Y,
                        undefined,
                        PLAYER_HITBOX_OFFSET_Y,
                    )
                    aimAngle = auto.angle
                    this.aimOffsetX = Math.cos(aimAngle) * 140
                    this.aimOffsetY = WEAPON_BASE_Y + Math.sin(aimAngle) * 140
                    touchBurstShot = true
                } else if (touch.manualShotSeq > lastManualShotSeq) {
                    lastManualShotSeq = touch.manualShotSeq
                    aimAngle = touch.aimAngle
                    this.aimOffsetX = Math.cos(aimAngle) * 180
                    this.aimOffsetY = WEAPON_BASE_Y + Math.sin(aimAngle) * 180
                    touchBurstShot = true
                }
            }

            const binds = this.pcControls
            const shootHeld = isHeld(binds.shoot)
            const shoot =
                shootHeld || pendingShot || touchBurstShot || Boolean(touch?.shoot) || Boolean(padSample?.shoot)
            const melee = pendingMelee || edges.meleePressed
            const reload = pendingReload || edges.reloadPressed
            const dash = pendingDash || edges.dashPressed

            pendingShot = false
            pendingMelee = false
            pendingReload = false
            pendingDash = false

            const hasDiscreteAction = melee || reload || dash || touchBurstShot
            const isActive = sampled.moveX !== 0 || sampled.moveY !== 0 || shoot
            const aimDiff = Math.abs(
                Math.atan2(Math.sin(aimAngle - lastSentAim), Math.cos(aimAngle - lastSentAim)),
            )
            const stateChanged =
                sampled.moveX !== lastSentMoveX ||
                sampled.moveY !== lastSentMoveY ||
                shoot !== lastSentShoot ||
                aimDiff > 0.015

            if (!force && !hasDiscreteAction && !stateChanged && !isActive) {
                return
            }

            const seq = ++lastSentSeq
            lastSentMoveX = sampled.moveX
            lastSentMoveY = sampled.moveY
            lastSentAim = aimAngle
            lastSentShoot = shoot
            this.liveControl.sentSeq = seq
            this.liveControl.sentMoveX = sampled.moveX
            this.liveControl.sentMoveY = sampled.moveY

            const payload: {
                moveX: number
                moveY: number
                aimAngle: number
                shoot?: boolean
                melee?: boolean
                reload?: boolean
                dash?: boolean
                seq?: number
            } = {
                moveX: sampled.moveX,
                moveY: sampled.moveY,
                aimAngle,
                shoot,
                seq,
            }
            if (melee) payload.melee = true
            if (reload) payload.reload = true
            if (dash) payload.dash = true

            this.controls.send(payload)
        }

        const handleBindingPress = (code: string): boolean => {
            const binds = this.pcControls
            if (code === binds.shoot) {
                this.playEmptyClickIfNeeded()
                pendingShot = true
                sendInput()
                return true
            } else if (code === binds.melee) {
                pendingMelee = true
                sendInput()
                return true
            } else if (code === binds.reload) {
                pendingReload = true
                sendInput()
                return true
            } else if (code === binds.dash) {
                pendingDash = true
                sendInput()
                return true
            } else if (code === binds.emote1) {
                this.controls.sendEmote?.('dots')
                return true
            } else if (code === binds.emote2) {
                this.controls.sendEmote?.('alert')
                return true
            } else if (code === binds.emote3) {
                this.controls.sendEmote?.('custom')
                return true
            }
            return false
        }

        this.dispatchAction = (action: ArenaActionKind) => {
            if (this.isPaused || this.currentPhase === 'finished') return
            if (action === 'melee') pendingMelee = true
            else if (action === 'reload') pendingReload = true
            else if (action === 'dash') pendingDash = true
            sendInput()
        }

        const onPointerMove = (next: Phaser.Input.Pointer) => {
            if (this.touchMode || this.isPaused || this.currentPhase === 'finished') return
            if (document.pointerLockElement === this.game.canvas) return
            const player = this.playerById.get(this.controls.playerId)
            if (!player) return

            const localView = this.playerViews.get(this.controls.playerId)
            const baseX = localView ? localView.root.x : player.x
            const baseY = localView ? localView.root.y : player.y
            const world = this.cameras.main.getWorldPoint(next.x, next.y)
            this.clampAimOffset(world.x - baseX, world.y - baseY)
        }

        const onLockedMouseMove = (event: MouseEvent) => {
            if (this.touchMode || this.isPaused || this.currentPhase === 'finished') return
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
            if (this.touchMode || this.isPaused || this.currentPhase === 'finished') return
            if (document.pointerLockElement !== this.game.canvas) {
                this.game.canvas.requestPointerLock?.()
            }
            const mouseCode = `Mouse${next.button}`
            pressedMouse.add(mouseCode)
            handleBindingPress(mouseCode)
        }

        const onPointerUp = (next: Phaser.Input.Pointer) => {
            pressedMouse.delete(`Mouse${next.button}`)
        }

        const onGlobalPointerUp = (event: PointerEvent) => {
            pressedMouse.delete(`Mouse${event.button}`)
        }

        const onContextMenu = (event: MouseEvent) => {
            event.preventDefault()
        }

        const stopMovement = () => {
            pressedCodes.clear()
            pressedMouse.clear()
            pendingShot = false
            pendingMelee = false
            pendingReload = false
            pendingDash = false
            const seq = ++lastSentSeq
            lastSentMoveX = 0
            lastSentMoveY = 0
            lastSentShoot = false
            lastSentAim = aimAngle
            this.liveControl.sentSeq = seq
            this.liveControl.sentMoveX = 0
            this.liveControl.sentMoveY = 0
            this.controls.send({ moveX: 0, moveY: 0, aimAngle, shoot: false, seq })
        }

        const onPointerLockChange = () => {
            if (this.touchMode) return
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

            if (
                event.code === 'KeyB' &&
                !event.repeat &&
                this.gameMode === 'practice' &&
                !this.isPaused &&
                this.currentPhase !== 'finished' &&
                this.onPracticeArsenalToggle &&
                !Object.values(this.pcControls).includes('KeyB')
            ) {
                this.isPaused = true
                stopMovement()
                if (document.pointerLockElement === this.game.canvas) {
                    document.exitPointerLock?.()
                }
                this.onPracticeArsenalToggle()
                return
            }

            if (
                event.code === 'Tab' &&
                !Object.values(this.pcControls).includes('Tab')
            ) {
                event.preventDefault()
                return
            }

            if (!hasFocus() || event.repeat || this.isPaused) return
            if (
                event.code === 'Space' ||
                event.code.startsWith('Arrow') ||
                event.code === this.pcControls.dash
            ) {
                event.preventDefault()
            }
            pressedCodes.add(event.code)
            const handledAction = handleBindingPress(event.code)
            if (
                !handledAction &&
                (event.code === this.pcControls.moveUp ||
                    event.code === this.pcControls.moveDown ||
                    event.code === this.pcControls.moveLeft ||
                    event.code === this.pcControls.moveRight)
            ) {
                sendInput()
            }
        }

        const onKeyUp = (event: KeyboardEvent) => {
            if (pressedCodes.delete(event.code) && hasFocus() && !this.isPaused) sendInput()
        }

        const onVisibilityChange = () => {
            if (document.hidden) stopMovement()
        }

        const onGamepadConnected = () => reportGamepadState(true)
        const onGamepadDisconnected = () =>
            reportGamepadState(Boolean(pickActiveGamepad(navigator.getGamepads?.())))

        this.input.on('pointermove', onPointerMove)
        this.input.on('pointerdown', onPointerDown)
        this.input.on('pointerup', onPointerUp)
        this.game.canvas.addEventListener('contextmenu', onContextMenu)
        document.addEventListener('mousemove', onLockedMouseMove)
        document.addEventListener('pointerlockchange', onPointerLockChange)
        window.addEventListener('pointerup', onGlobalPointerUp)
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('blur', stopMovement)
        document.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('gamepadconnected', onGamepadConnected)
        window.addEventListener('gamepaddisconnected', onGamepadDisconnected)

        const timer = window.setInterval(() => {
            if (hasFocus()) sendInput()
        }, INPUT_INTERVAL_MS)

        this.cleanupControls = () => {
            window.clearInterval(timer)
            this.sampleLiveControl = undefined
            this.input.off('pointermove', onPointerMove)
            this.input.off('pointerdown', onPointerDown)
            this.input.off('pointerup', onPointerUp)
            this.game.canvas.removeEventListener('contextmenu', onContextMenu)
            document.removeEventListener('mousemove', onLockedMouseMove)
            document.removeEventListener('pointerlockchange', onPointerLockChange)
            window.removeEventListener('pointerup', onGlobalPointerUp)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('blur', stopMovement)
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('gamepadconnected', onGamepadConnected)
            window.removeEventListener('gamepaddisconnected', onGamepadDisconnected)
        }
    }

    applyWorldSnapshot(snapshot: ArenaWorldSnapshot) {
        this.players = snapshot.players
        this.playerById.clear()
        for (const player of snapshot.players) {
            this.playerById.set(player.id, player)
        }
        this.bullets = snapshot.bullets
        this.pickups = snapshot.pickups
        this.powerUps = snapshot.powerUps
        if (this.isReady && this.sys.isActive()) {
            this.applyPlayers(snapshot.players)
            this.applyBullets(snapshot.bullets)
            this.applyPickups(snapshot.pickups)
            this.applyPowerUps(snapshot.powerUps)
        }
    }

    setPlayers(players: PlayerState[]) {
        this.players = players
        this.playerById.clear()
        for (const player of players) {
            this.playerById.set(player.id, player)
        }
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

    setPowerUps(powerUps: PowerUpState[]) {
        this.powerUps = powerUps
        if (this.isReady && this.sys.isActive()) this.applyPowerUps(powerUps)
    }

    private applyPickups(pickups: PickupState[]) {
        if (pickups.length === this.pickupViews.size) {
            let allMatch = true
            for (const pickup of pickups) {
                if (!this.pickupViews.has(pickup.id)) {
                    allMatch = false
                    break
                }
            }
            if (allMatch) return
        }

        this.activePickupIds.clear()
        for (const pickup of pickups) {
            this.activePickupIds.add(pickup.id)
        }

        for (const [id, view] of this.pickupViews) {
            if (!this.activePickupIds.has(id)) {
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

    private applyPowerUps(powerUps: PowerUpState[]) {
        if (powerUps.length === this.powerUpViews.size) {
            let allMatch = true
            for (const powerUp of powerUps) {
                if (!this.powerUpViews.has(powerUp.id)) {
                    allMatch = false
                    break
                }
            }
            if (allMatch) return
        }

        this.activePowerUpIds.clear()
        for (const p of powerUps) {
            this.activePowerUpIds.add(p.id)
        }

        for (const [id, view] of this.powerUpViews) {
            if (!this.activePowerUpIds.has(id)) {
                view.root.destroy()
                this.powerUpViews.delete(id)
            }
        }

        for (const powerUp of powerUps) {
            if (this.powerUpViews.has(powerUp.id)) continue

            const meta = POWERUP_META[powerUp.kind]
            const isGolden = powerUp.kind === 'golden'
            const outerRadius = isGolden ? 30 : 21
            const glow = this.add.circle(0, 0, outerRadius, meta.color, isGolden ? 0.36 : 0.26)
            glow.setStrokeStyle(isGolden ? 3 : 2, isGolden ? 0xfef08a : 0x3d2e4f)

            const children: Phaser.GameObjects.GameObject[] = [glow]
            if (isGolden) {
                const beacon = this.add.circle(0, 0, 38, 0xfacc15, 0.14)
                beacon.setStrokeStyle(2, 0xfef08a, 0.85)
                children.unshift(beacon)
                this.tweens.add({
                    targets: beacon,
                    scale: 1.35,
                    alpha: 0.05,
                    duration: 900,
                    repeat: -1,
                    ease: 'Sine.easeOut',
                })
                this.playSound('coin-c', 0.5)
            }

            const size = isGolden ? POWERUP_DISPLAY_SIZE + 10 : POWERUP_DISPLAY_SIZE
            const sprite = this.add
                .image(0, 0, `powerup-${powerUp.kind}`)
                .setDisplaySize(size, size)
            children.push(sprite)

            const root = this.add.container(powerUp.x, powerUp.y, children).setDepth(powerUp.y + 1)

            this.tweens.add({
                targets: sprite,
                y: isGolden ? -7 : -4,
                duration: isGolden ? 550 : 750,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            })

            this.powerUpViews.set(powerUp.id, { root, sprite, kind: powerUp.kind })
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
        if (phase === 'playing' && previous !== 'playing') {
            this.localDashGraceUntil = 0
            const local = this.playerById.get(this.controls.playerId)
            if (local) {
                this.localPredictor.reset(local.x, local.y)
                const localView = this.playerViews.get(this.controls.playerId)
                if (localView) {
                    localView.root.setPosition(local.x, local.y)
                    localView.root.setDepth(local.y)
                    localView.body.setDepth(local.y)
                    localView.weapon.setDepth(local.y + 1)
                }
            }
            if (this.isReady) {
                this.playSound('select-a', 0.4)
            }
        }
    }

    private applyBullets(bullets: BulletState[]) {
        this.activeBulletIds.clear()
        for (const bullet of bullets) {
            this.activeBulletIds.add(bullet.id)
        }

        for (const [id, bv] of this.bulletViews) {
            if (!this.activeBulletIds.has(id)) {
                bv.sprite.destroy()
                this.bulletViews.delete(id)
            }
        }

        for (const bullet of bullets) {
            if (this.bulletViews.has(bullet.id)) continue

            const weaponType: WeaponType = bullet.weaponType ?? 'rifle'
            const isHeavy = HEAVY_WEAPONS.has(weaponType)
            const textureKey =
                weaponType === 'plasma' ? 'bullet-plasma' : isHeavy ? 'bullet-heavy' : 'bullet-small'
            const baseSize = isHeavy ? HEAVY_BULLET_BASE_SIZE : SMALL_BULLET_BASE_SIZE
            const bulletScale = typeof bullet.scale === 'number' && bullet.scale > 0 ? bullet.scale : 1
            const displaySize = baseSize * bulletScale

            const sprite = this.add
                .image(bullet.x, bullet.y, textureKey)
                .setDisplaySize(displaySize, displaySize)
                .setRotation(weaponType === 'plasma' ? bullet.angle + Math.PI / 2 : bullet.angle)
                .setDepth(bullet.y + 2)
            if (weaponType === 'launcher') {
                sprite.setTint(0xff6b35)
            }

            this.bulletViews.set(bullet.id, {
                sprite,
                x: bullet.x,
                y: bullet.y,
                vx: bullet.vx,
                vy: bullet.vy,
                weaponType,
                lastTrailAt: this.time.now,
                stopped: false,
            })

            const isOwn = bullet.ownerId === this.controls.playerId
            if (isOwn || this.isNearViewport(bullet.x, bullet.y, 120)) {
                this.spawnMuzzleFlash(bullet.x, bullet.y)
                const shootSfx =
                    weaponType === 'plasma'
                        ? 'shoot-b'
                        : weaponType === 'launcher'
                          ? 'shoot-a'
                          : 'shoot-g'
                this.playSpatialSound(
                    shootSfx,
                    weaponType === 'launcher' ? 0.42 : 0.35,
                    bullet.x,
                    bullet.y,
                    900,
                    isOwn,
                )
                this.maybeEjectShell(bullet, weaponType, isHeavy)
            }

            if (isOwn) {
                this.cameras.main.shake(60, 0.002)
                this.pulseCrosshair()
            }
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

    private playDashEffect(view: PlayerView, dashAngle: number, isLocal = false) {
        this.playSpatialSound('jump-a', 0.42, view.root.x, view.root.y, 850, isLocal)
        if (!isLocal && !this.isNearViewport(view.root.x, view.root.y, 120)) return
        const startX = view.root.x
        const startY = view.root.y
        const facingLeft = view.body.flipX

        for (let i = 0; i < 3; i++) {
            const offset = i * 16
            const ghost = this.add
                .image(
                    startX - Math.cos(dashAngle) * offset,
                    startY - Math.sin(dashAngle) * offset,
                    `player-${view.skin}-idle`,
                )
                .setDisplaySize(PLAYER_DISPLAY_SIZE, PLAYER_DISPLAY_SIZE)
                .setOrigin(0.5, 0.85)
                .setFlipX(facingLeft)
                .setTint(0x38bdf8)
                .setAlpha(0.55 - i * 0.14)
                .setDepth(startY - 1)

            this.tweens.add({
                targets: ghost,
                alpha: 0,
                scaleX: ghost.scaleX * 0.92,
                scaleY: ghost.scaleY * 0.92,
                duration: 220 + i * 45,
                onComplete: () => ghost.destroy(),
            })
        }
    }

    private applyPlayers(players: PlayerState[]) {
        this.activePlayerIds.clear()
        for (const player of players) {
            this.activePlayerIds.add(player.id)
        }

        for (const [id, view] of this.playerViews) {
            if (!this.activePlayerIds.has(id)) {
                view.root.destroy()
                this.playerViews.delete(id)
                this.customEmoteDataUrls.delete(id)
                const emoteKey = `emote-custom-${id}`
                if (this.textures.exists(emoteKey)) {
                    this.textures.remove(emoteKey)
                    this.customEmoteLoadedKeys.delete(emoteKey)
                }
            }
        }

        for (const player of players) {
            const skin: PlayerSkin = SKINS.includes(player.skin) ? player.skin : 'fox'
            const team: TeamColor | '' =
                player.team === 'orange' || player.team === 'blue' ? player.team : ''
            const teamColor: TeamColor =
                team ||
                (player.teamColor === 'blue' || skin === 'mouse' || skin === 'rabbit'
                    ? 'blue'
                    : 'orange')
            const weaponType: WeaponType = WEAPON_TYPES.includes(player.weaponType)
                ? player.weaponType
                : 'rifle'

            let view = this.playerViews.get(player.id)
            const isLocal = player.id === this.controls.playerId
            const isNewView = !view
            let dashedNow = false

            const isBot = Boolean(player.isBot)

            if (!view) {
                view = this.createPlayerView(
                    player.name,
                    player.x,
                    player.y,
                    player.hp ?? 100,
                    skin,
                    teamColor,
                    team,
                    weaponType,
                    isBot,
                )
                view.lastMeleeSeq = player.meleeAttackSeq ?? 0
                view.lastDashSeq = player.dashSeq ?? 0
                view.lastShield = player.shield ?? 0
                view.lastGolden = player.goldenRemaining ?? 0
                view.lastDashes = player.dashes ?? 5
                view.lastReserveAmmo = player.reserveAmmo ?? 0
                view.lastReloading = Boolean(player.isReloading)
                view.lastAmmo = player.ammo ?? 0
                this.playerViews.set(player.id, view)
                if (isLocal) {
                    this.localPredictor.reset(player.x, player.y)
                }
            } else {
                if (!isLocal && (player.x !== view.lastX || player.y !== view.lastY)) {
                    view.lastX = player.x
                    view.lastY = player.y
                    view.lastMovedAt = this.time.now
                } else {
                    view.lastX = player.x
                    view.lastY = player.y
                }

                if (view.team !== team || view.isBot !== isBot) {
                    view.team = team
                    view.isBot = isBot
                    this.updateTeamVisuals(view, team, isBot)
                }

                const weaponChanged = view.weaponType !== weaponType || view.teamColor !== teamColor
                if (weaponChanged) {
                    const prevWeapon = view.weaponType
                    view.weaponType = weaponType
                    view.teamColor = teamColor
                    view.weapon.setTexture(`weapon-${weaponType}-${teamColor}`)
                    view.hpBarFill.setTexture(
                        teamColor === 'blue' ? 'hp-bar-fill-blue' : 'hp-bar-fill',
                    )
                    if (MELEE_WEAPONS.has(weaponType)) {
                        view.weapon.setOrigin(0.5, 0.85)
                    } else {
                        view.weapon.setOrigin(0.2, 0.5)
                    }
                    if (prevWeapon !== weaponType && isLocal) {
                        this.playSound('coin-a', 0.45)
                    }
                }

                const seq = player.meleeAttackSeq ?? 0
                if (seq > view.lastMeleeSeq) {
                    view.lastMeleeSeq = seq
                    const meleeKind: MeleeWeaponType = MELEE_WEAPONS.has(weaponType)
                        ? (weaponType as MeleeWeaponType)
                        : (player.lastMeleeWeapon ?? 'knife')
                    this.playSpatialSound('shoot-f', 0.42, view.root.x, view.root.y, 850, isLocal)
                    if (isLocal || this.isNearViewport(view.root.x, view.root.y, 140)) {
                        this.playMeleeSlash(
                            view,
                            player.lastMeleeAngle ?? player.aimAngle,
                            meleeKind,
                            teamColor,
                            !MELEE_WEAPONS.has(weaponType),
                        )
                    }
                }

                const dashSeq = player.dashSeq ?? 0
                dashedNow = dashSeq > view.lastDashSeq
                if (dashedNow) {
                    view.lastDashSeq = dashSeq
                    this.playDashEffect(view, player.dashAngle ?? player.aimAngle, isLocal)
                }

                const currentHp = player.hp ?? 100
                const currentShield = player.shield ?? 0
                const currentGolden = player.goldenRemaining ?? 0
                const currentDashes = player.dashes ?? 5
                const currentReserve = player.reserveAmmo ?? 0
                const currentReloading = Boolean(player.isReloading)
                const currentAmmo = player.ammo ?? 0

                if (currentHp < view.lastHp) {
                    this.playSpatialSound('hurt-a', 0.45, view.root.x, view.root.y, 850, isLocal)
                    if (isLocal || this.isNearViewport(view.root.x, view.root.y, 140)) {
                        view.body.setTint(0xff4d4d)
                        this.time.delayedCall(120, () => {
                            if (view && view.body.scene) view.body.clearTint()
                        })
                    }
                    if (isLocal) {
                        this.cameras.main.shake(60, 0.002)
                    }
                }

                if (currentGolden > 0 && view.lastGolden === 0) {
                    this.playSound('coin-c', 0.55)
                } else if (isLocal) {
                    if (currentReloading && !view.lastReloading) {
                        this.playSound('move-a', 0.4)
                    } else if (!currentReloading && view.lastReloading && currentAmmo > view.lastAmmo) {
                        this.playSound('coin-b', 0.42)
                    } else if (
                        !view.isDead &&
                        (currentShield > view.lastShield ||
                            currentHp > view.lastHp ||
                            currentDashes > view.lastDashes ||
                            (!weaponChanged && currentReserve > view.lastReserveAmmo))
                    ) {
                        this.playSound('coin-b', 0.45)
                    }
                }

                view.lastHp = currentHp
                view.lastShield = currentShield
                view.lastGolden = currentGolden
                view.lastDashes = currentDashes
                view.lastReserveAmmo = currentReserve
                view.lastReloading = currentReloading
                view.lastAmmo = currentAmmo
            }

            const wasDead = view.isDead
            const isDeadNow = Boolean(player.isDead)
            if (!isNewView && isDeadNow && !wasDead) {
                this.playSpatialSound(
                    isLocal ? 'lose-c' : 'hurt-d',
                    0.5,
                    view.root.x,
                    view.root.y,
                    900,
                    isLocal,
                )
            }

            const respawnTeleport =
                (!isDeadNow && wasDead) ||
                Math.hypot(player.x - view.root.x, player.y - view.root.y) > 200

            view.targetX = player.x
            view.targetY = player.y
            if (isLocal) {
                if (dashedNow) {
                    this.localDashGraceUntil = this.time.now + 240
                    this.localPredictor.reset(view.root.x, view.root.y)
                } else if (isNewView || isDeadNow || respawnTeleport) {
                    this.localDashGraceUntil = 0
                    this.localPredictor.reset(player.x, player.y)
                    view.root.setPosition(player.x, player.y)
                    view.root.setDepth(player.y)
                    view.body.setDepth(player.y)
                } else if (this.time.now >= this.localDashGraceUntil) {
                    const reconciled = this.localPredictor.reconcile(
                        player.x,
                        player.y,
                        player.lastInputSeq ?? 0,
                    )
                    view.root.setPosition(reconciled.x, reconciled.y)
                    view.root.setDepth(reconciled.y)
                    view.body.setDepth(reconciled.y)
                }
            } else if (isNewView || respawnTeleport) {
                view.root.setPosition(player.x, player.y)
                view.root.setDepth(player.y)
                view.body.setDepth(player.y)
            }

            const facingLeft = player.aimAngle > Math.PI / 2 || player.aimAngle < -Math.PI / 2
            view.isDead = isDeadNow
            if (!isLocal || isDeadNow || this.isPaused || this.currentPhase === 'finished' || !this.sampleLiveControl) {
                view.body.setFlipX(facingLeft)
            }

            if (view.isDead) {
                if (view.emoteSprite.texture.key !== 'emote-skull') {
                    view.emoteSprite.setTexture('emote-skull')
                }
                view.emoteSprite.setDisplaySize(EMOTE_DISPLAY_SIZE, EMOTE_DISPLAY_SIZE)
                view.emoteSprite.setVisible(true)
                if (isNewView || !wasDead) {
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
                const customKey = `emote-custom-${player.id}`
                if (player.emote === 'custom' && this.textures.exists(customKey)) {
                    if (view.emoteSprite.texture.key !== customKey) {
                        view.emoteSprite.setTexture(customKey)
                    }
                    view.emoteSprite.setDisplaySize(CUSTOM_EMOTE_DISPLAY_SIZE, CUSTOM_EMOTE_DISPLAY_SIZE)
                    view.emoteSprite.setVisible(true)
                } else if (player.emote === 'dots' || player.emote === 'alert') {
                    const emoteKey = `emote-${player.emote}`
                    if (view.emoteSprite.texture.key !== emoteKey) {
                        view.emoteSprite.setTexture(emoteKey)
                    }
                    view.emoteSprite.setDisplaySize(EMOTE_DISPLAY_SIZE, EMOTE_DISPLAY_SIZE)
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
                view.shieldBarBg.setVisible(false)
                view.shieldBarFill.setVisible(false)
                view.reloadBarBg.setVisible(false)
                view.reloadBarFill.setVisible(false)
                view.auraRing.setVisible(false)
                view.teamRing.setVisible(false)
                view.renderedShieldBarMode = 'none'
                view.renderedAuraMode = 'none'
                view.renderedShieldProgress = -1
                view.renderedReloading = false
                view.renderedReloadProgress = -1
                continue
            }

            view.weapon.setVisible(true)
            view.hpBarFrame.setVisible(true)
            view.hpBarFill.setVisible(true)
            const showTeamRing = (this.gameMode === 'tdm' && Boolean(team)) || view.isBot
            if (view.teamRing.visible !== showTeamRing) {
                view.teamRing.setVisible(showTeamRing)
            }

            const hpRatio = Math.max(0, Math.min(1, (player.hp ?? 100) / 100))
            if (Math.abs(hpRatio - view.renderedHpRatio) > 0.004) {
                view.renderedHpRatio = hpRatio
                view.hpBarFill.setCrop(0, 0, Math.round(192 * hpRatio), 64)
            }

            const shieldVal = player.shield ?? 0
            const shieldProgress = Math.max(
                0,
                Math.min(1, player.shieldProgress ?? (shieldVal > 0 ? 1 : 0)),
            )
            const goldenSec = player.goldenRemaining ?? 0
            const shieldBarMode: 'none' | 'shield' | 'golden' =
                shieldVal > 0 && shieldProgress > 0
                    ? goldenSec > 0
                        ? 'golden'
                        : 'shield'
                    : 'none'

            if (shieldBarMode !== 'none') {
                if (view.renderedShieldBarMode === 'none') {
                    view.shieldBarBg.setVisible(true)
                    view.shieldBarFill.setVisible(true)
                }
                if (Math.abs(shieldProgress - view.renderedShieldProgress) > 0.004) {
                    view.renderedShieldProgress = shieldProgress
                    view.shieldBarFill.setDisplaySize(
                        Math.max(2, (HP_BAR_WIDTH - 4) * shieldProgress),
                        5,
                    )
                }
                if (view.renderedShieldBarMode !== shieldBarMode) {
                    view.shieldBarFill.setFillStyle(
                        shieldBarMode === 'golden' ? 0xfacc15 : 0x38bdf8,
                        1,
                    )
                }
            } else if (view.renderedShieldBarMode !== 'none') {
                view.shieldBarBg.setVisible(false)
                view.shieldBarFill.setVisible(false)
                view.renderedShieldProgress = -1
            }
            view.renderedShieldBarMode = shieldBarMode

            const auraMode: 'none' | 'shield' | 'golden' =
                goldenSec > 0 ? 'golden' : shieldVal > 0 ? 'shield' : 'none'
            if (view.renderedAuraMode !== auraMode) {
                view.renderedAuraMode = auraMode
                if (auraMode === 'golden') {
                    view.auraRing.setVisible(true)
                    view.auraRing.setFillStyle(0xfacc15, 0.16)
                    view.auraRing.setStrokeStyle(3, 0xfef08a, 0.95)
                } else if (auraMode === 'shield') {
                    view.auraRing.setVisible(true)
                    view.auraRing.setFillStyle(0x38bdf8, 0.14)
                    view.auraRing.setStrokeStyle(2.5, 0x7dd3fc, 0.9)
                } else {
                    view.auraRing.setVisible(false)
                }
            }

            if (player.isReloading) {
                const progress = Math.max(0, Math.min(1, player.reloadProgress ?? 0))
                if (!view.renderedReloading) {
                    view.renderedReloading = true
                    view.reloadBarBg.setVisible(true)
                    view.reloadBarFill.setVisible(true)
                }
                if (Math.abs(progress - view.renderedReloadProgress) > 0.004) {
                    view.renderedReloadProgress = progress
                    view.reloadBarFill.setDisplaySize(Math.max(2, (HP_BAR_WIDTH - 4) * progress), 4)
                }
            } else if (view.renderedReloading) {
                view.renderedReloading = false
                view.renderedReloadProgress = -1
                view.reloadBarBg.setVisible(false)
                view.reloadBarFill.setVisible(false)
            }

            if (!isLocal || this.isPaused || this.currentPhase === 'finished' || !this.sampleLiveControl) {
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
            }
            view.weapon.setDepth(view.root.y + 1)
        }
    }

    private updateTeamVisuals(view: PlayerView, team: TeamColor | '', isBot = false) {
        if (isBot) {
            view.teamRing.setFillStyle(0xf59e0b, 0.22)
            view.teamRing.setStrokeStyle(2.5, 0xfbbf24, 0.92)
            view.label.setColor('#fde68a')
        } else if (team === 'blue') {
            view.teamRing.setFillStyle(0x3b82f6, 0.25)
            view.teamRing.setStrokeStyle(2.5, 0x93c5fd, 0.95)
            view.label.setColor('#bfdbfe')
        } else if (team === 'orange') {
            view.teamRing.setFillStyle(0xf97316, 0.25)
            view.teamRing.setStrokeStyle(2.5, 0xfdba74, 0.95)
            view.label.setColor('#fed7aa')
        } else {
            view.label.setColor('#ffffff')
        }
    }

    private playMeleeSlash(
        view: PlayerView,
        attackAngle: number,
        weaponType: MeleeWeaponType,
        teamColor: TeamColor,
        isQuickMelee: boolean,
    ) {
        const facingLeft = attackAngle > Math.PI / 2 || attackAngle < -Math.PI / 2
        const baseAngle = attackAngle + Math.PI / 2
        const dir = facingLeft ? -1 : 1
        const startAngle = baseAngle - dir * Phaser.Math.DegToRad(65)
        const endAngle = baseAngle + dir * Phaser.Math.DegToRad(75)

        if (isQuickMelee) {
            const quickSprite = this.add
                .image(
                    view.root.x + Math.cos(attackAngle) * 16,
                    view.root.y + WEAPON_BASE_Y + Math.sin(attackAngle) * 16,
                    `weapon-${weaponType}-${teamColor}`,
                )
                .setDisplaySize(WEAPON_DISPLAY_SIZE * 0.9, WEAPON_DISPLAY_SIZE * 0.9)
                .setOrigin(0.5, 0.85)
                .setFlipX(facingLeft)
                .setRotation(startAngle)
                .setDepth(view.root.y + 4)

            this.tweens.add({
                targets: quickSprite,
                rotation: endAngle,
                alpha: 0.2,
                duration: 150,
                ease: 'Cubic.easeOut',
                onComplete: () => quickSprite.destroy(),
            })
        } else {
            view.isSwinging = true
            this.tweens.killTweensOf(view.weapon)
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
        }

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
        team: TeamColor | '',
        weaponType: WeaponType,
        isBot = false,
    ): PlayerView {
        const teamRing = this.add
            .ellipse(0, 4, 46, 20, 0xf97316, 0.25)
            .setStrokeStyle(2.5, 0xfdba74, 0.95)
            .setVisible(false)

        const auraRing = this.add
            .circle(0, -24, 34, 0x38bdf8, 0.14)
            .setStrokeStyle(2.5, 0x7dd3fc, 0.9)
            .setVisible(false)

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
        const initialHpRatio = Math.max(0, Math.min(1, hp / 100))
        if (initialHpRatio < 1) {
            hpBarFill.setCrop(0, 0, Math.round(192 * initialHpRatio), 64)
        }

        const hpBarFrame = this.add
            .image(0, HP_BAR_Y, 'hp-bar-frame')
            .setDisplaySize(HP_BAR_WIDTH, HP_BAR_HEIGHT)

        const shieldBarBg = this.add
            .rectangle(0, HP_BAR_Y - 11, HP_BAR_WIDTH, 7, 0x1e1629, 0.88)
            .setStrokeStyle(1, 0x38bdf8, 0.9)
            .setVisible(false)
        const shieldBarFill = this.add
            .rectangle(-(HP_BAR_WIDTH - 4) / 2, HP_BAR_Y - 11, HP_BAR_WIDTH - 4, 5, 0x38bdf8, 1)
            .setOrigin(0, 0.5)
            .setVisible(false)

        const reloadBarBg = this.add
            .rectangle(0, HP_BAR_Y + 11, HP_BAR_WIDTH, 6, 0x1e1629, 0.85)
            .setStrokeStyle(1, 0xf59e0b, 0.9)
            .setVisible(false)
        const reloadBarFill = this.add
            .rectangle(-(HP_BAR_WIDTH - 4) / 2, HP_BAR_Y + 11, 2, 4, 0xfbbf24, 1)
            .setOrigin(0, 0.5)
            .setVisible(false)

        const label = this.add
            .text(0, -82, name, {
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
            teamRing,
            auraRing,
            body,
            weapon,
            hpBarFill,
            hpBarFrame,
            shieldBarBg,
            shieldBarFill,
            reloadBarBg,
            reloadBarFill,
            label,
            emoteSprite,
        ])

        const view: PlayerView = {
            root,
            teamRing,
            auraRing,
            body,
            weapon,
            emoteSprite,
            hpBarFrame,
            hpBarFill,
            shieldBarBg,
            shieldBarFill,
            reloadBarBg,
            reloadBarFill,
            label,
            skin,
            teamColor,
            team,
            weaponType,
            isDead: false,
            isBot,
            lastHp: hp,
            lastShield: 0,
            lastGolden: 0,
            lastDashes: 5,
            lastReserveAmmo: 0,
            lastReloading: false,
            lastAmmo: 0,
            lastMeleeSeq: 0,
            lastDashSeq: 0,
            isSwinging: false,
            targetX: x,
            targetY: y,
            lastX: x,
            lastY: y,
            lastMovedAt: -WALK_ANIM_TIMEOUT_MS,
            renderedHpRatio: initialHpRatio,
            renderedShieldProgress: -1,
            renderedShieldBarMode: 'none',
            renderedAuraMode: 'none',
            renderedReloadProgress: -1,
            renderedReloading: false,
        }
        this.updateTeamVisuals(view, team, isBot)
        return view
    }
}

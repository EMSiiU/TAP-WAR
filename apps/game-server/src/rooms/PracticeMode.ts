import type { PowerUpKind } from '../../../../packages/shared/gameplay.js'
import type { PlayerSkin, TeamColor, WeaponType } from './ArenaState.js'

export const PRACTICE_PLAYER_SPAWN = { x: 128, y: 128 } as const
export const PRACTICE_BOT_RESPAWN_MS = 1500
export const PRACTICE_BOT_IDLE_HEAL_MS = 6000
export const PRACTICE_POWERUP_RESPAWN_MS = 4000
export const PRACTICE_ACTION_COOLDOWN_MS = 100

export type PracticeDummySpec = {
    id: string
    name: string
    skin: PlayerSkin
    teamColor: TeamColor
    homeX: number
    homeY: number
    patrol: { endX: number; endY: number; speed: number } | null
}

export const PRACTICE_DUMMY_SPECS: readonly PracticeDummySpec[] = [
    {
        id: 'bot-static-close',
        name: 'Blanco Fijo',
        skin: 'mouse',
        teamColor: 'blue',
        homeX: 352,
        homeY: 128,
        patrol: null,
    },
    {
        id: 'bot-static-far',
        name: 'Blanco Lejano',
        skin: 'rabbit',
        teamColor: 'blue',
        homeX: 896,
        homeY: 128,
        patrol: null,
    },
    {
        id: 'bot-patrol-h',
        name: 'Blanco Móvil',
        skin: 'squirrel',
        teamColor: 'orange',
        homeX: 640,
        homeY: 640,
        patrol: { endX: 896, endY: 640, speed: 140 },
    },
    {
        id: 'bot-patrol-v',
        name: 'Blanco Patrulla',
        skin: 'fox',
        teamColor: 'orange',
        homeX: 352,
        homeY: 304,
        patrol: { endX: 352, endY: 464, speed: 125 },
    },
]

export const PRACTICE_POWERUP_STATIONS: readonly {
    id: string
    kind: PowerUpKind
    x: number
    y: number
}[] = [
    { id: 'pad-ammo', kind: 'ammo', x: 128, y: 640 },
    { id: 'pad-medkit', kind: 'medkit', x: 200, y: 640 },
    { id: 'pad-shield', kind: 'shield', x: 272, y: 640 },
    { id: 'pad-dash', kind: 'dash', x: 344, y: 640 },
    { id: 'pad-golden', kind: 'golden', x: 416, y: 640 },
]

export const PRACTICE_SAMPLE_PICKUPS: readonly {
    weaponType: WeaponType
    x: number
    y: number
}[] = [
    { weaponType: 'shotgun', x: 512, y: 230 },
    { weaponType: 'sniper', x: 512, y: 538 },
]

export type PracticeAction =
    | { action: 'equip_weapon'; weapon: WeaponType }
    | { action: 'refill' }
    | { action: 'self_damage' }
    | { action: 'reset_dummies' }
    | { action: 'toggle_dummy_shield' }

export function parsePracticeAction(
    value: unknown,
    validWeapons: Record<string, unknown>,
): PracticeAction | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }
    if (!('action' in value) || typeof value.action !== 'string') {
        return null
    }

    switch (value.action) {
        case 'equip_weapon': {
            if (!('weapon' in value) || typeof value.weapon !== 'string') return null
            if (!Object.prototype.hasOwnProperty.call(validWeapons, value.weapon)) return null
            return { action: 'equip_weapon', weapon: value.weapon as WeaponType }
        }
        case 'refill':
            return { action: 'refill' }
        case 'self_damage':
            return { action: 'self_damage' }
        case 'reset_dummies':
            return { action: 'reset_dummies' }
        case 'toggle_dummy_shield':
            return { action: 'toggle_dummy_shield' }
        default:
            return null
    }
}

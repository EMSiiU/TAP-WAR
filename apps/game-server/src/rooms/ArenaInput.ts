export type ArenaInput = {
    moveX: number
    moveY: number
    aimAngle: number
    shoot?: boolean
    melee?: boolean
    reload?: boolean
    dash?: boolean
    seq?: number
}

function isMoveAxis(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
    return value === undefined || typeof value === 'boolean'
}

function isOptionalSeq(value: unknown): value is number | undefined {
    return (
        value === undefined ||
        (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff)
    )
}

export function parseArenaInput(value: unknown): ArenaInput | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }

    if (!('moveX' in value) || !('moveY' in value) || !('aimAngle' in value)) {
        return null
    }

    const { moveX, moveY, aimAngle } = value
    const shoot = 'shoot' in value ? value.shoot : undefined
    const melee = 'melee' in value ? value.melee : undefined
    const reload = 'reload' in value ? value.reload : undefined
    const dash = 'dash' in value ? value.dash : undefined
    const seq = 'seq' in value ? value.seq : undefined

    if (
        !isMoveAxis(moveX) ||
        !isMoveAxis(moveY) ||
        typeof aimAngle !== 'number' ||
        !Number.isFinite(aimAngle) ||
        aimAngle < -Math.PI ||
        aimAngle >= Math.PI ||
        !isOptionalBoolean(shoot) ||
        !isOptionalBoolean(melee) ||
        !isOptionalBoolean(reload) ||
        !isOptionalBoolean(dash) ||
        !isOptionalSeq(seq)
    ) {
        return null
    }

    const parsed: ArenaInput = { moveX, moveY, aimAngle }
    if (shoot !== undefined) parsed.shoot = shoot
    if (melee !== undefined) parsed.melee = melee
    if (reload !== undefined) parsed.reload = reload
    if (dash !== undefined) parsed.dash = dash
    if (seq !== undefined) parsed.seq = seq
    return parsed
}

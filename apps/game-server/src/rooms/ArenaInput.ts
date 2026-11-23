export type ArenaInput = {
    moveX: number
    moveY: number
    aimAngle: number
    shoot?: boolean
}

function isMoveAxis(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1
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

    if (
        !isMoveAxis(moveX) ||
        !isMoveAxis(moveY) ||
        typeof aimAngle !== 'number' ||
        !Number.isFinite(aimAngle) ||
        aimAngle < -Math.PI ||
        aimAngle >= Math.PI ||
        (shoot !== undefined && typeof shoot !== 'boolean')
    ) {
        return null
    }

    return shoot === undefined ? { moveX, moveY, aimAngle } : { moveX, moveY, aimAngle, shoot }
}

type MoveAxis = -1 | 0 | 1

export type ArenaInput = {
    moveX: MoveAxis
    moveY: MoveAxis
    aimAngle: number
}

function isMoveAxis(value: unknown): value is MoveAxis {
    return value === -1 || value === 0 || value === 1
}

export function parseArenaInput(value: unknown): ArenaInput | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }

    if (!('moveX' in value) || !('moveY' in value) || !('aimAngle' in value)) {
        return null
    }

    const { moveX, moveY, aimAngle } = value

    if (
        !isMoveAxis(moveX) ||
        !isMoveAxis(moveY) ||
        typeof aimAngle !== 'number' ||
        !Number.isFinite(aimAngle) ||
        aimAngle < -Math.PI ||
        aimAngle >= Math.PI
    ) {
        return null
    }

    return { moveX, moveY, aimAngle }
}
import type { Profile } from './profile.ts'

export const CUSTOM_EMOTE_SIZE = 128
export const MAX_CUSTOM_EMOTE_INPUT_BYTES = 2 * 1024 * 1024
export const MAX_CUSTOM_EMOTE_BYTES = 128 * 1024
export const CUSTOM_EMOTE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const CUSTOM_EMOTE_DATA_URL_PATTERN = /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/

export function isSafeCustomEmoteDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 190_000 &&
    CUSTOM_EMOTE_DATA_URL_PATTERN.test(value)
  )
}

function drawRoundedStickerPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + size - radius, y)
  ctx.quadraticCurveTo(x + size, y, x + size, y + radius)
  ctx.lineTo(x + size, y + size - radius)
  ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size)
  ctx.lineTo(x + radius, y + size)
  ctx.quadraticCurveTo(x, y + size, x, y + size - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export async function prepareCustomEmote(file: File): Promise<Blob> {
  if (!CUSTOM_EMOTE_TYPES.includes(file.type)) {
    throw new Error('Elige una imagen JPG, PNG o WebP.')
  }
  if (!file.size || file.size > MAX_CUSTOM_EMOTE_INPUT_BYTES) {
    throw new Error('La imagen debe pesar como máximo 2 MB y no estar vacía.')
  }

  let image: ImageBitmap
  try {
    image = await createImageBitmap(file)
  } catch {
    throw new Error('No se pudo leer esa imagen. Prueba con otra.')
  }

  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000) {
      throw new Error('La imagen es demasiado grande. Usa una de menor resolución.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = CUSTOM_EMOTE_SIZE
    canvas.height = CUSTOM_EMOTE_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar el emote en este navegador.')

    // TODO(security): Malware AV scanning is not configured; canvas decoding + WebP re-encoding strips metadata and active payloads.
    const pad = 4
    const inner = CUSTOM_EMOTE_SIZE - pad * 2
    const radius = 28

    context.clearRect(0, 0, CUSTOM_EMOTE_SIZE, CUSTOM_EMOTE_SIZE)
    context.save()
    drawRoundedStickerPath(context, pad, pad, inner, radius)
    context.clip()
    const side = Math.min(image.width, image.height)
    context.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      pad,
      pad,
      inner,
      inner,
    )
    context.restore()

    // Borde doble estilo sticker para que destaque igual que los emotes del juego.
    drawRoundedStickerPath(context, pad, pad, inner, radius)
    context.lineWidth = 6
    context.strokeStyle = '#3d2e4f'
    context.stroke()
    context.lineWidth = 2.5
    context.strokeStyle = '#fff9f2'
    context.stroke()

    for (const quality of [0.82, 0.65, 0.48]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality),
      )
      if (blob && blob.type === 'image/webp' && blob.size <= MAX_CUSTOM_EMOTE_BYTES) {
        return blob
      }
    }
    throw new Error('La imagen pesa demasiado tras convertirla a emote. Prueba con otra.')
  } finally {
    image.close()
  }
}

type Failure = { code?: string; message?: string }

export type CustomEmoteGateway = {
  upload: (path: string, blob: Blob) => Promise<{ error: Failure | null }>
  update: (
    id: string,
    updatedAt: string,
    fields: { custom_emote_path: string | null },
  ) => Promise<{ data: Profile | null; error: Failure | null }>
  remove: (path: string) => Promise<{ error: Failure | null }>
}

export class CustomEmoteError extends Error {
  readonly reloadProfile: boolean
  constructor(message: string, reloadProfile = false) {
    super(message)
    this.reloadProfile = reloadProfile
  }
}

function isMigrationMissingError(error: Failure): boolean {
  const msg = error.message ?? ''
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /custom_emote_path|Bucket not found/i.test(msg)
  )
}

export async function saveCustomEmote(
  gateway: CustomEmoteGateway,
  profile: Profile,
  emote: Blob | null,
): Promise<{ profile: Profile; cleanupPending: boolean }> {
  let uploadedPath: string | undefined
  if (emote instanceof Blob) {
    if (emote.type !== 'image/webp' || !emote.size || emote.size > MAX_CUSTOM_EMOTE_BYTES) {
      throw new CustomEmoteError('No se pudo preparar el emote. Selecciona la imagen de nuevo.')
    }
    uploadedPath = `${profile.id}/${crypto.randomUUID()}.webp`
    const { error } = await gateway.upload(uploadedPath, emote)
    if (error) {
      if (isMigrationMissingError(error)) {
        throw new CustomEmoteError('Falta aplicar la migración de emotes en Supabase.')
      }
      throw new CustomEmoteError('No se pudo subir el emote. Inténtalo de nuevo.')
    }
  }

  const nextPath = uploadedPath ?? null
  const { data, error } = await gateway.update(profile.id, profile.updated_at, {
    custom_emote_path: nextPath,
  })
  if (error || !data) {
    const definitelyNotWritten = !error || /^(23|42)/.test(error.code ?? '') || isMigrationMissingError(error)
    if (uploadedPath && definitelyNotWritten) {
      try {
        await gateway.remove(uploadedPath)
      } catch {
        /* Reintentar limpieza luego. */
      }
    }
    if (!error) {
      throw new CustomEmoteError('El perfil cambió en otra pestaña. Recarga antes de cambiar el emote.', true)
    }
    if (isMigrationMissingError(error)) {
      throw new CustomEmoteError('Falta aplicar la migración de emotes en Supabase.')
    }
    throw new CustomEmoteError('No se pudo confirmar el guardado del emote. Inténtalo de nuevo.', true)
  }

  let cleanupPending = false
  if (profile.custom_emote_path && profile.custom_emote_path !== data.custom_emote_path) {
    try {
      cleanupPending = Boolean((await gateway.remove(profile.custom_emote_path)).error)
    } catch {
      cleanupPending = true
    }
  }

  return { profile: data, cleanupPending }
}

import { validUsername, type Profile } from './profile.ts'

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!AVATAR_TYPES.includes(file.type)) throw new Error('Elige una imagen JPG, PNG o WebP.')
  if (!file.size || file.size > MAX_AVATAR_BYTES) throw new Error('La imagen debe pesar como máximo 2 MB y no estar vacía.')
  let image: ImageBitmap
  try { image = await createImageBitmap(file) }
  catch { throw new Error('No se pudo leer esa imagen. Prueba con otra.') }
  try {
    if (!image.width || !image.height || image.width * image.height > 40000000) {
      throw new Error('La imagen es demasiado grande. Usa una de menor resolución.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar la imagen en este navegador.')
    const side = Math.min(image.width, image.height)
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 512, 512)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .85))
    if (!blob || blob.type !== 'image/webp' || blob.size > MAX_AVATAR_BYTES) {
      throw new Error('No se pudo preparar la imagen. Prueba con otra.')
    }
    return blob
  } finally { image.close() }
}

type Failure = { code?: string; message: string }
export type ProfileGateway = {
  upload: (path: string, photo: Blob) => Promise<{ error: Failure | null }>
  update: (id: string, updatedAt: string, fields: { username: string; avatar_path?: string | null }) =>
    Promise<{ data: Profile | null; error: Failure | null }>
  remove: (path: string) => Promise<{ error: Failure | null }>
}

export class AccountSaveError extends Error {
  readonly reloadProfile: boolean
  constructor(message: string, reloadProfile = false) {
    super(message)
    this.reloadProfile = reloadProfile
  }
}

export async function saveAccountProfile(gateway: ProfileGateway, profile: Profile, username: string,
  photo: Blob | null | undefined): Promise<{ profile: Profile; cleanupPending: boolean }> {
  if (!validUsername(username)) throw new AccountSaveError('Usa de 3 a 20 letras sin acentos, números o guion bajo.')
  const fields: { username: string; avatar_path?: string | null } = { username }
  let uploadedPath: string | undefined
  if (photo instanceof Blob) {
    if (photo.type !== 'image/webp' || !photo.size || photo.size > MAX_AVATAR_BYTES) {
      throw new AccountSaveError('No se pudo preparar la foto. Selecciónala de nuevo.')
    }
    uploadedPath = `${profile.id}/${crypto.randomUUID()}.webp`
    const { error } = await gateway.upload(uploadedPath, photo)
    if (error) throw new AccountSaveError('No se pudo subir la foto. Inténtalo de nuevo.')
    fields.avatar_path = uploadedPath
  } else if (photo === null) fields.avatar_path = null

  const { data, error } = await gateway.update(profile.id, profile.updated_at, fields)
  if (error || !data) {
    // Borrar solo cuando sabemos que la escritura no se realizo. Ante errores
    // de red ambiguos, conservar el archivo: la fila podria estar apuntandolo.
    const definitelyNotWritten = !error || /^(23|42)/.test(error.code ?? '')
    if (uploadedPath && definitelyNotWritten) {
      try { await gateway.remove(uploadedPath) } catch { /* Reintentar limpieza despues. */ }
    }
    if (!error) throw new AccountSaveError('El perfil cambió en otra pestaña. Actualízalo antes de guardar.', true)
    if (error.code === '23505') throw new AccountSaveError('Ese username ya está ocupado. Prueba con otro.')
    if (error.code === '23514') throw new AccountSaveError('Revisa el username y la foto seleccionada.')
    throw new AccountSaveError('No se pudo confirmar el guardado. Actualiza el perfil antes de reintentar.', true)
  }

  let cleanupPending = false
  if (photo !== undefined && profile.avatar_path && profile.avatar_path !== data.avatar_path) {
    try { cleanupPending = Boolean((await gateway.remove(profile.avatar_path)).error) }
    catch { cleanupPending = true }
  }
  return { profile: data, cleanupPending }
}

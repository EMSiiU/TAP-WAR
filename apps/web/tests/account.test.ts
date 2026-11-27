import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountSaveError, MAX_AVATAR_BYTES, saveAccountProfile, type ProfileGateway } from '../src/auth/account.ts'
import { buildOAuthOptions, validUsername, type Profile } from '../src/auth/profile.ts'

const profile: Profile = {
  id: '11111111-1111-4111-8111-111111111111', username: 'Jugador',
  preferred_skin: 'fox', preferred_weapon: 'rifle', crosshair_style: 'outline',
  created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-20T10:00:00Z',
  avatar_path: '11111111-1111-4111-8111-111111111111/old.webp',
}

function setup(options: { uploadFailure?: boolean; updateCode?: string; stale?: boolean; cleanupFailure?: boolean } = {}) {
  const operations: string[] = []
  let uploaded: string | undefined
  let fields: { username: string; avatar_path?: string | null } | undefined
  const gateway: ProfileGateway = {
    upload: async path => {
      operations.push('upload'); uploaded = path
      return { error: options.uploadFailure ? { message: 'upload failed' } : null }
    },
    update: async (id, updatedAt, changes) => {
      operations.push('update'); fields = changes
      assert.equal(id, profile.id)
      assert.equal(updatedAt, profile.updated_at)
      return { data: options.updateCode || options.stale ? null : { ...profile, ...changes },
        error: options.updateCode ? { code: options.updateCode, message: 'failed' } : null }
    },
    remove: async path => {
      operations.push(`remove:${path}`)
      return { error: options.cleanupFailure ? { message: 'offline' } : null }
    },
  }
  return { gateway, operations, uploaded: () => uploaded, fields: () => fields }
}

const photo = () => new Blob(['normalized-image'], { type: 'image/webp' })

test('username valida ASCII completo y rechaza saltos finales', () => {
  for (const value of ['abc', 'A_1', 'a'.repeat(20)]) assert.ok(validUsername(value))
  for (const value of ['', 'ab', 'a'.repeat(21), 'ábc', 'a b', 'abc\n', 'abc\r']) assert.equal(validUsername(value), false)
})

test('username invalido no sube ni escribe archivos', async () => {
  const mock = setup()
  await assert.rejects(saveAccountProfile(mock.gateway, profile, 'ab', photo()), /3 a 20/)
  assert.deepEqual(mock.operations, [])
})

test('editar solo username no incluye avatar_path: compatible antes de aplicar Storage', async () => {
  const mock = setup()
  const result = await saveAccountProfile(mock.gateway, profile, 'Nuevo', undefined)
  assert.deepEqual(mock.fields(), { username: 'Nuevo' })
  assert.deepEqual(mock.operations, ['update'])
  assert.equal(result.profile.username, 'Nuevo')
})

test('reemplazo sube primero, guarda con version de fila y borra la foto anterior al final', async () => {
  const mock = setup()
  const result = await saveAccountProfile(mock.gateway, profile, 'Jugador', photo())
  assert.match(mock.uploaded()!, new RegExp(`^${profile.id}/[a-f0-9-]{36}\\.webp$`))
  assert.deepEqual(mock.operations, ['upload', 'update', `remove:${profile.avatar_path}`])
  assert.equal(result.profile.avatar_path, mock.uploaded())
  assert.equal(result.cleanupPending, false)
})

test('fallo de subida conserva la referencia anterior y no actualiza el perfil', async () => {
  const mock = setup({ uploadFailure: true })
  await assert.rejects(saveAccountProfile(mock.gateway, profile, 'Jugador', photo()), /subir/)
  assert.deepEqual(mock.operations, ['upload'])
})

test('username ocupado elimina solo el archivo nuevo, sin tocar la foto anterior', async () => {
  const mock = setup({ updateCode: '23505' })
  await assert.rejects(saveAccountProfile(mock.gateway, profile, 'Ocupado', photo()), /ocupado/)
  assert.deepEqual(mock.operations, ['upload', 'update', `remove:${mock.uploaded()}`])
})

test('un perfil actualizado desde otra pestaña impide sobrescribir y pide recargar', async () => {
  const mock = setup({ stale: true })
  await assert.rejects(saveAccountProfile(mock.gateway, profile, 'Jugador', photo()),
    failure => failure instanceof AccountSaveError && failure.reloadProfile)
  assert.deepEqual(mock.operations, ['upload', 'update', `remove:${mock.uploaded()}`])
})

test('un fallo ambiguo de red no borra una foto que podria haberse guardado', async () => {
  const mock = setup({ updateCode: 'NETWORK' })
  await assert.rejects(saveAccountProfile(mock.gateway, profile, 'Jugador', photo()), /confirmar el guardado/)
  assert.deepEqual(mock.operations, ['upload', 'update'])
})

test('quitar foto elimina la referencia antes de borrar el archivo', async () => {
  const mock = setup()
  const result = await saveAccountProfile(mock.gateway, profile, 'Jugador', null)
  assert.equal(mock.fields()?.avatar_path, null)
  assert.deepEqual(mock.operations, ['update', `remove:${profile.avatar_path}`])
  assert.equal(result.profile.avatar_path, null)
})

test('un fallo al borrar la anterior no se presenta como fallo de guardado', async () => {
  const mock = setup({ cleanupFailure: true })
  const result = await saveAccountProfile(mock.gateway, profile, 'Jugador', photo())
  assert.equal(result.profile.avatar_path, mock.uploaded())
  assert.equal(result.cleanupPending, true)
})

test('solo se suben imagenes WebP normalizadas y de hasta 2 MB', async () => {
  for (const blob of [new Blob(['svg'], { type: 'image/svg+xml' }),
    new Blob([], { type: 'image/webp' }), new Blob([new Uint8Array(MAX_AVATAR_BYTES + 1)], { type: 'image/webp' })]) {
    const mock = setup()
    await assert.rejects(saveAccountProfile(mock.gateway, profile, 'Jugador', blob), /preparar la foto/)
    assert.deepEqual(mock.operations, [])
  }
})

test('buildOAuthOptions solicita selector de cuenta en Google y mantiene callback en otros proveedores', () => {
  assert.deepEqual(buildOAuthOptions('google', 'https://example.com'), {
    redirectTo: 'https://example.com/auth/callback',
    queryParams: { prompt: 'select_account' },
  })
  assert.deepEqual(buildOAuthOptions('github', 'https://example.com'), {
    redirectTo: 'https://example.com/auth/callback',
  })
})

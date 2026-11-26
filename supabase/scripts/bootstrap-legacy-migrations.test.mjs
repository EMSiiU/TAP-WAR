import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractAppliedVersions,
  extractFirstRow,
  selectLegacyVersionsToRepair,
} from './bootstrap-legacy-migrations.mjs'

test('selectLegacyVersionsToRepair devuelve vacio en una base nueva (deja todo a db push)', () => {
  const result = selectLegacyVersionsToRepair({
    hasProfiles: false,
    hasAvatars: false,
    hasRankings: false,
    appliedVersions: new Set(),
  })
  assert.deepEqual(result, [])
})

test('selectLegacyVersionsToRepair repara las 3 migraciones heredadas en una base iniciada manualmente', () => {
  const result = selectLegacyVersionsToRepair({
    hasProfiles: true,
    hasAvatars: true,
    hasRankings: true,
    appliedVersions: new Set(),
  })
  assert.deepEqual(result, ['20261120000100', '20261120000200', '20261123000100'])
})

test('selectLegacyVersionsToRepair omite versiones ya registradas y nunca toca migraciones idempotentes recientes', () => {
  const partial = selectLegacyVersionsToRepair({
    hasProfiles: true,
    hasAvatars: true,
    hasRankings: true,
    appliedVersions: new Set(['20261120000100']),
  })
  assert.deepEqual(partial, ['20261120000200', '20261123000100'])

  const complete = selectLegacyVersionsToRepair({
    hasProfiles: true,
    hasAvatars: true,
    hasRankings: true,
    appliedVersions: new Set(['20261120000100', '20261120000200', '20261123000100']),
  })
  assert.deepEqual(complete, [])
})

test('extractFirstRow y extractAppliedVersions soportan multiples formatos JSON del CLI de Supabase', () => {
  const row = { has_profiles: true, has_avatars: true, has_rankings: true, has_history: false }
  assert.deepEqual(extractFirstRow([row]), row)
  assert.deepEqual(extractFirstRow({ rows: [row] }), row)
  assert.deepEqual(extractFirstRow({ result: { rows: [row] } }), row)
  assert.deepEqual(extractFirstRow({ data: [row] }), row)

  const versions = extractAppliedVersions({
    result: {
      rows: [{ version: '20261120000100' }, { version: ' 20261120000200 ' }, { version: null }],
    },
  })
  assert.deepEqual(versions, new Set(['20261120000100', '20261120000200']))
})

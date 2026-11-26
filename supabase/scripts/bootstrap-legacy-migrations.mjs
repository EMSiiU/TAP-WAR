import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const LEGACY_MIGRATIONS = [
  { version: '20261120000100', flag: 'hasProfiles' },
  { version: '20261120000200', flag: 'hasAvatars' },
  { version: '20261123000100', flag: 'hasRankings' },
]

const SCHEMA_INSPECT_SQL = `
select
  to_regclass('public.profiles') is not null as has_profiles,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'avatar_path'
  ) as has_avatars,
  to_regclass('public.matches') is not null as has_rankings,
  to_regclass('supabase_migrations.schema_migrations') is not null as has_history;
`.trim()

const HISTORY_VERSIONS_SQL =
  'select version::text as version from supabase_migrations.schema_migrations;'

function unwrapRows(parsed, depth = 0) {
  if (depth > 4 || parsed == null) return []
  if (Array.isArray(parsed)) return parsed
  if (typeof parsed !== 'object') return []

  for (const key of ['rows', 'data', 'result']) {
    if (key in parsed) {
      const candidate = unwrapRows(parsed[key], depth + 1)
      if (candidate.length > 0 || Array.isArray(parsed[key])) {
        return candidate
      }
    }
  }

  if (
    'has_profiles' in parsed ||
    'has_avatars' in parsed ||
    'has_rankings' in parsed ||
    'has_history' in parsed ||
    'version' in parsed
  ) {
    return [parsed]
  }

  return []
}

/** Extracts the first data row from various Supabase CLI `-o json` response envelopes. */
export function extractFirstRow(parsedJson) {
  const rows = unwrapRows(parsedJson)
  return rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null ? rows[0] : null
}

/** Extracts applied migration versions from `schema_migrations` query JSON output. */
export function extractAppliedVersions(parsedJson) {
  const rows = unwrapRows(parsedJson)
  const versions = new Set()
  for (const row of rows) {
    if (row && typeof row === 'object' && typeof row.version === 'string' && row.version.trim()) {
      versions.add(row.version.trim())
    }
  }
  return versions
}

/**
 * Returns the ordered allow-listed legacy migration versions that already exist
 * physically in Postgres (from earlier manual SQL Editor runs) and are not yet
 * recorded in `supabase_migrations.schema_migrations`.
 */
export function selectLegacyVersionsToRepair({
  hasProfiles,
  hasAvatars,
  hasRankings,
  appliedVersions,
}) {
  const flags = {
    hasProfiles: Boolean(hasProfiles),
    hasAvatars: Boolean(hasAvatars),
    hasRankings: Boolean(hasRankings),
  }
  const applied =
    appliedVersions instanceof Set ? appliedVersions : new Set(appliedVersions ?? [])

  const repair = []
  for (const entry of LEGACY_MIGRATIONS) {
    if (flags[entry.flag] && !applied.has(entry.version)) {
      repair.push(entry.version)
    }
  }
  return repair
}

function toBool(value) {
  return value === true || value === 'true' || value === 't' || value === 1
}

function runSupabaseJsonQuery(sql) {
  const stdout = execFileSync(
    'supabase',
    ['db', 'query', '--remote', '--read-only', '-o', 'json', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  return JSON.parse(stdout)
}

function main() {
  const dryRun = process.env.DRY_RUN === 'true'
  const inspectRaw = runSupabaseJsonQuery(SCHEMA_INSPECT_SQL)
  const inspectRow = extractFirstRow(inspectRaw)
  if (!inspectRow) {
    throw new Error('Could not parse schema inspection output from `supabase db query`.')
  }

  const hasHistory = toBool(inspectRow.has_history)
  const appliedVersions = hasHistory
    ? extractAppliedVersions(runSupabaseJsonQuery(HISTORY_VERSIONS_SQL))
    : new Set()

  const toRepair = selectLegacyVersionsToRepair({
    hasProfiles: toBool(inspectRow.has_profiles),
    hasAvatars: toBool(inspectRow.has_avatars),
    hasRankings: toBool(inspectRow.has_rankings),
    appliedVersions,
  })

  if (toRepair.length === 0) {
    console.log('No legacy migration repairs needed.')
    return
  }

  for (const version of toRepair) {
    if (dryRun) {
      console.log(`[dry-run] Would mark legacy migration ${version} as applied`)
      continue
    }
    console.log(`Marking already-applied legacy migration ${version} in history...`)
    execFileSync(
      'supabase',
      ['migration', 'repair', version, '--status', 'applied', '--remote', '--yes'],
      { stdio: 'inherit' },
    )
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isEntrypoint) {
  main()
}

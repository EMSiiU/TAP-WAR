import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { GameMode, TeamId } from '../../../packages/shared/gameplay.js'

export type Participant = {
  accountId: string
  sessionId: string
  name: string
  kills: number
  deaths: number
  abandoned: boolean
  team?: TeamId
  weaponTier?: number
}

export type MatchResult = {
  id: string
  startedAt: string
  endedAt: string
  reason: 'time' | 'kills' | 'abandon' | 'interrupted'
  players: (Participant & { outcome: 'win' | 'draw' | 'loss'; points: number })[]
}

export type ResolveResultOptions = {
  gameMode?: GameMode
  winningTeam?: TeamId | 'draw'
  orangeScore?: number
  blueScore?: number
}

export function resolveResults(
  players: Participant[],
  reason: MatchResult['reason'],
  winnerId?: string,
  options?: ResolveResultOptions,
): MatchResult['players'] {
  if (reason === 'interrupted') {
    return players.map((p) => ({ ...p, outcome: 'loss', points: 0 }))
  }

  const eligible = players.filter((p) => !p.abandoned)

  if (options?.gameMode === 'tdm') {
    let winningTeam = options.winningTeam
    if (!winningTeam) {
      const orangeActive = eligible.some((p) => p.team === 'orange')
      const blueActive = eligible.some((p) => p.team === 'blue')
      if (reason === 'abandon' && orangeActive !== blueActive) {
        winningTeam = orangeActive ? 'orange' : 'blue'
      } else {
        const orangeScore =
          options.orangeScore ??
          players.filter((p) => p.team === 'orange').reduce((sum, p) => sum + p.kills, 0)
        const blueScore =
          options.blueScore ??
          players.filter((p) => p.team === 'blue').reduce((sum, p) => sum + p.kills, 0)
        if (orangeScore > blueScore) winningTeam = 'orange'
        else if (blueScore > orangeScore) winningTeam = 'blue'
        else winningTeam = 'draw'
      }
    }

    return players.map((p) => {
      if (p.abandoned) return { ...p, outcome: 'loss', points: 0 }
      if (winningTeam === 'draw') return { ...p, outcome: 'draw', points: 1 }
      const won = p.team === winningTeam
      return { ...p, outcome: won ? 'win' : 'loss', points: won ? 3 : 0 }
    })
  }

  if (options?.gameMode === 'gungame') {
    const best = [...eligible].sort(
      (a, b) =>
        (b.weaponTier ?? 0) - (a.weaponTier ?? 0) ||
        b.kills - a.kills ||
        a.deaths - b.deaths,
    )[0]
    const leaders = winnerId
      ? eligible.filter((p) => p.sessionId === winnerId)
      : eligible.filter(
          (p) =>
            (p.weaponTier ?? 0) === (best?.weaponTier ?? 0) &&
            p.kills === best?.kills &&
            p.deaths === best?.deaths,
        )
    return players.map((p) => {
      const outcome =
        p.abandoned || !leaders.includes(p)
          ? 'loss'
          : leaders.length === 1
            ? 'win'
            : 'draw'
      return { ...p, outcome, points: outcome === 'win' ? 3 : outcome === 'draw' ? 1 : 0 }
    })
  }

  const best = [...eligible].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0]
  const leaders = winnerId
    ? eligible.filter((p) => p.sessionId === winnerId)
    : eligible.filter((p) => p.kills === best?.kills && p.deaths === best?.deaths)
  return players.map((p) => {
    const outcome =
      p.abandoned || !leaders.includes(p)
        ? 'loss'
        : leaders.length === 1
          ? 'win'
          : 'draw'
    return { ...p, outcome, points: outcome === 'win' ? 3 : outcome === 'draw' ? 1 : 0 }
  })
}

type Journal = { id: string; startedAt: string; players?: Participant[]; result?: MatchResult }
export type SaveState = 'saving' | 'saved' | 'pending' | 'failed'
// One process owns this directory. JSON is written before calling Supabase so
// a lost response or restart can safely retry the same immutable match UUID.
export class ResultStore {
  private directory: string
  private send: (result: MatchResult) => Promise<void>
  private pending = new Map<string, { journal: Journal; notify?: (state: SaveState) => void }>()
  private busy = new Set<string>()
  private timer?: ReturnType<typeof setInterval>
  constructor(directory: string, send: (result: MatchResult) => Promise<void>) {
    this.directory = resolve(directory)
    this.send = send
  }
  private async write(journal: Journal) {
    const path = join(this.directory, `${journal.id}.json`)
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(journal), { mode: 0o600, flush: true })
    await rename(temporary, path)
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    for (const file of await readdir(this.directory)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(file)) continue
      const journal = JSON.parse(await readFile(join(this.directory, file), 'utf8')) as Journal
      // A process restart cannot reconstruct a running simulation. No points.
      if (!journal.result) {
        journal.result = {
          id: journal.id,
          startedAt: journal.startedAt,
          endedAt: new Date().toISOString(),
          reason: 'interrupted',
          players: resolveResults(journal.players || [], 'interrupted'),
        }
      }
      this.pending.set(journal.id, { journal })
    }
    await this.retry()
    this.timer = setInterval(() => {
      void this.retry()
    }, 15_000)
    this.timer.unref()
  }
  async begin(id: string, startedAt: string, players: Participant[]) {
    await this.write({ id, startedAt, players })
  }
  async finish(result: MatchResult, notify: (state: SaveState) => void) {
    this.pending.set(result.id, {
      journal: { id: result.id, startedAt: result.startedAt, result },
      notify,
    })
    await this.flush(result.id)
  }
  private async flush(id: string) {
    if (this.busy.has(id)) return
    const entry = this.pending.get(id)
    if (!entry?.journal.result) return
    this.busy.add(id)
    try {
      try {
        await this.write(entry.journal)
      } catch {
        entry.notify?.('failed')
        return
      }
      entry.notify?.('pending')
      await this.send(entry.journal.result)
      // A leftover file is harmless: the RPC is idempotent.
      await unlink(join(this.directory, `${id}.json`))
      this.pending.delete(id)
      entry.notify?.('saved')
    } catch {
      entry.notify?.('pending')
    } finally {
      this.busy.delete(id)
    }
  }
  async retry() {
    await Promise.all([...this.pending.keys()].map((id) => this.flush(id)))
  }
  close() {
    if (this.timer) clearInterval(this.timer)
  }
}

let store: ResultStore | undefined
export function getResultStore() {
  if (!store)
    throw new Error('Configura SUPABASE_SECRET_KEY en el servidor para iniciar partidas clasificadas.')
  return store
}
export async function initializeResults() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) {
    console.warn('Rankings: falta SUPABASE_SECRET_KEY; el inicio de partidas queda deshabilitado.')
    return
  }
  const client = createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  })
  store = new ResultStore(process.env.MATCH_DATA_DIR || '.data/matches', async (result) => {
    const { error } = await client.rpc('record_match_result', { payload: result })
    if (error) {
      console.error(
        'Rankings: error al persistir resultado en Supabase:',
        error.code ?? 'sin-codigo',
        error.message,
      )
      throw new Error('No se pudo persistir el resultado')
    }
  })
  await store.initialize()
}

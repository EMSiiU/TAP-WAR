import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResultStore, resolveResults, type MatchResult, type Participant } from './results.js'
import { ArenaRoom } from './rooms/ArenaRoom.js'
import type { Client } from 'colyseus'

const players = (): Participant[] => [
  { accountId: randomUUID(), sessionId: 'a', name: 'Uno', kills: 4, deaths: 2, abandoned: false },
  { accountId: randomUUID(), sessionId: 'b', name: 'Dos', kills: 4, deaths: 3, abandoned: false },
  { accountId: randomUUID(), sessionId: 'c', name: 'Tres', kills: 1, deaths: 4, abandoned: false },
]
const result = (): MatchResult => ({ id: randomUUID(), startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), reason: 'time', players: resolveResults(players(), 'time') })

test('tiempo: kills, luego menos muertes; empate solo entre líderes', () => {
  const p = players()
  assert.deepEqual(resolveResults(p, 'time').map(p => p.points), [3,0,0])
  p[1].deaths = 2
  assert.deepEqual(resolveResults(p, 'time').map(p => p.points), [1,1,0])
})
test('20 kills declara al ganador explícito; un abandono nunca gana', () => {
  const p = players()
  p[0].kills = 20
  assert.deepEqual(resolveResults(p, 'kills', 'a').map(p => p.points), [3,0,0])
  p[0].abandoned = true
  p[2].abandoned = true
  assert.deepEqual(resolveResults(p, 'abandon', 'b').map(p => p.points), [0,3,0])
})
test('interrupción: todos sin puntos, sin victorias', () => {
  assert.ok(resolveResults(players(), 'interrupted').every(p => p.points === 0 && p.outcome === 'loss'))
})
test('fallo de red: el resultado sobrevive al reinicio y se reenvía sin cambiar UUID', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tap-war-results-'))
  const first = new ResultStore(directory, async () => { throw new Error('offline') })
  const sent: MatchResult[] = []
  const second = new ResultStore(directory, async r => { sent.push(r) })
  try {
    await first.initialize()
    const r = result(); const states: string[] = []
    await first.begin(r.id, r.startedAt, r.players)
    await first.finish(r, s => states.push(s))
    assert.ok(states.includes('pending')); assert.ok(!states.includes('saved'))
    first.close()
    assert.equal((await readdir(directory)).filter(f => f.endsWith('.json')).length, 1)
    await second.initialize()
    assert.deepEqual(sent, [r])
    assert.deepEqual(await readdir(directory), [])
    await second.retry()
    assert.equal(sent.length, 1)
  } finally { first.close(); second.close(); await rm(directory, { recursive: true, force: true }) }
})
test('reinicio durante una ronda registra interrupción y no inventa resultados', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tap-war-interrupted-'))
  const sent: MatchResult[] = []
  const first = new ResultStore(directory, async () => {})
  const second = new ResultStore(directory, async r => { sent.push(r) })
  try {
    await first.initialize()
    const id = randomUUID(); await first.begin(id, new Date().toISOString(), players())
    first.close(); await second.initialize()
    assert.equal(sent[0].id, id); assert.equal(sent[0].reason, 'interrupted')
    assert.ok(sent[0].players.every(p => p.points === 0))
  } finally { first.close(); second.close(); await rm(directory, { recursive: true, force: true }) }
})
test('fallo de disco no se anuncia como guardado y conserva el cierre para reintentar', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tap-war-disk-'))
  const blocked = join(directory, 'not-a-directory')
  await writeFile(blocked, 'blocked')
  let sent = false
  const store = new ResultStore(blocked, async () => { sent = true })
  try {
    const states: string[] = []
    await store.finish(result(), s => states.push(s))
    assert.deepEqual(states, ['failed']); assert.equal(sent, false)
  } finally { store.close(); await rm(directory, { recursive: true, force: true }) }
})

test('sala: inicio manual, cuenta única, 300s/20kills, entrada en curso y abandono conservado una sola vez', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tap-war-room-'))
  const sent: MatchResult[] = []
  const store = new ResultStore(directory, async r => { sent.push(r) })
  const room = new ArenaRoom(store)
  // No network transport is needed to exercise the authoritative lifecycle.
  room.lock = async () => {}; room.unlock = async () => {}
  const a = { sessionId: 'a' } as Client; const b = { sessionId: 'b' } as Client; const c = { sessionId: 'c' } as Client
  const account = (name: string) => ({ accountId: randomUUID(), name, expiresAt: Date.now()+60000, skin: 'fox' as const, teamColor: 'orange' as const, weapon: 'rifle' as const })
  const aa = account('Uno'); const bb = account('Dos'); const cc = account('Tres')
  try {
    await store.initialize()
    room.onJoin(a, {}, aa); room.onJoin(b, {}, bb)
    assert.equal(room.state.phase, 'waiting'); assert.equal(room.state.hostId, 'a')
    assert.throws(() => room.onJoin({ sessionId: 'duplicate' } as Client, {}, aa), /cuenta ya ocupa/)
    await room['startMatch']()
    assert.equal(room.state.phase, 'playing'); assert.equal(room.state.timeRemaining,300); assert.equal(room.state.killsToWin,20)
    // Mid-match join is allowed while playing and capacity permits.
    room.onJoin(c, {}, cc)
    assert.equal(room.state.players.size, 3)
    room.state.players.get('a')!.kills = 2
    room.state.players.get('b')!.kills = 1
    room.onLeave(c)
    room.onLeave(b)
    assert.equal(room.state.phase,'finished'); assert.equal(room.state.winnerId,'a')
    assert.equal(JSON.parse(room.state.resultSummary).length, 3)
    assert.throws(() => room.onJoin({ sessionId: 'late-after-finish' } as Client, {}, account('Cuatro')), /ya terminó/)
    // Await the asynchronous disk flush without assuming timer durations.
    for (let i=0; i<100 && !sent.length; i++) await new Promise(r => setTimeout(r,5))
    assert.equal(sent.length,1)
    assert.equal(sent[0].players[1].abandoned,true); assert.equal(sent[0].players[1].kills,1)
    assert.deepEqual(sent[0].players.map(p => p.points), [3,0,0])
    room['finishMatch']('a','Uno')
    assert.equal(sent.length,1)
  } finally { room.onDispose(); store.close(); await new Promise(r => setTimeout(r,20)); await rm(directory, { recursive: true, force: true }) }
})

test('la vigésima kill finaliza inmediatamente y un cierre posterior no sobrescribe el resultado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tap-war-kills-'))
  let saved: MatchResult | undefined
  const store = new ResultStore(directory, async r => { saved = r })
  const room = new ArenaRoom(store)
  room.lock = async () => {}; room.unlock = async () => {}
  try {
    await store.initialize()
    for (const id of ['a','b']) room.onJoin({ sessionId: id } as Client, {}, { accountId: randomUUID(), name: id,
      expiresAt: Date.now()+60000, skin: 'fox', teamColor: 'orange', weapon: 'rifle' })
    await room['startMatch']()
    const a = room.state.players.get('a')!; const b = room.state.players.get('b')!
    a.kills = 18
    room['applyDamageToPlayer']('b', b, 'a', 100, performance.now())
    assert.equal(room.state.phase,'playing'); assert.equal(a.kills,19)
    b.hp = 100; b.isDead = false
    room['applyDamageToPlayer']('b', b, 'a', 100, performance.now())
    assert.equal(room.state.phase,'finished'); assert.equal(room.state.finishReason,'kills')
    assert.equal(room.state.winnerId,'a'); assert.ok(room.state.timeRemaining>0)
    room['finishMatchByTime']()
    for (let i=0; i<100 && !saved; i++) await new Promise(r => setTimeout(r,5))
    assert.equal(saved?.reason,'kills'); assert.equal(saved?.players[0].kills,20)
  } finally { room.onDispose(); store.close(); await new Promise(r => setTimeout(r,20)); await rm(directory, { recursive: true, force: true }) }
})

test('abandono con cuatro participantes: se conserva la pérdida y el tiempo empata solo a los líderes', () => {
  const p = players()
  p[0].kills = 20; p[0].abandoned = true
  p[1].kills = 4; p[1].deaths = 2
  p.push({ ...p[1], accountId: randomUUID(), sessionId: 'd', name: 'Cuatro' })
  assert.deepEqual(resolveResults(p,'time').map(p => p.points),[0,1,0,1])
  assert.equal(resolveResults(p,'time')[0].kills,20)
})

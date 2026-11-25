import test from 'node:test'
import assert from 'node:assert/strict'
import { getArenaMap, normalizeEnvironment, type ArenaMapConfig } from './rooms/ArenaMaps.js'
import { buildMapLayers } from '../../../packages/shared/mapCatalog.js'
import { isBulletHittingObstacle, moveInsideArena } from './rooms/ArenaCollision.js'
import { ArenaRoom } from './rooms/ArenaRoom.js'

const sizes = ['small','medium','large'] as const
const environments = ['desert','industrial'] as const

function blocked(map: ArenaMapConfig, x: number, y: number) {
  return map.obstacles.some(o => {
    const dx=x-Math.max(o.x,Math.min(x,o.x+o.width))
    const dy=y-Math.max(o.y,Math.min(y,o.y+o.height))
    return dx*dx+dy*dy < map.playerRadius**2
  })
}

for (const environment of environments) for (const size of sizes) {
  test(`${environment}/${size}: todas las coberturas visibles coinciden con las colisiones`, () => {
    const map=getArenaMap(size,environment)
    const layers=buildMapLayers(map)
    assert.equal(map.environment,environment)
    for (const o of map.obstacles) {
      for (const value of [o.x,o.y,o.width,o.height]) assert.equal(value%32,0)
      assert.ok(o.x>=0 && o.y>=0 && o.x+o.width<=map.width && o.y+o.height<=map.height)
    }
    for (let y=0;y<layers.solids.length;y++) for(let x=0;x<layers.solids[y].length;x++) {
      const visible=layers.solids[y][x]!==-1
      assert.equal(visible,isBulletHittingObstacle(x*32+16,y*32+16,0,map),`Celda ${x},${y}`)
      assert.ok(layers.solids[y][x]<234)
      assert.ok((environment==='industrial' ? [29,70] : [64,65,173]).includes(layers.ground[y][x]))
    }
  })
  test(`${environment}/${size}: spawns, armas y power-ups libres, distintos y conectados`, () => {
    const map=getArenaMap(size,environment)
    assert.equal(new Set(map.spawnPoints.map(p=>`${p.x},${p.y}`)).size,map.maxPlayers)
    assert.ok(map.powerUpSpawnPoints.length >= 4)
    assert.equal(
      new Set(map.powerUpSpawnPoints.map(p=>`${p.x},${p.y}`)).size,
      map.powerUpSpawnPoints.length,
    )
    const points=[...map.spawnPoints,...map.pickupSpawnPoints,...map.powerUpSpawnPoints,map.goldenSpawnPoint]
    for (const p of points) {
      assert.ok(p.x>32+map.playerRadius && p.y>32+map.playerRadius)
      assert.ok(p.x<map.width-32-map.playerRadius && p.y<map.height-32-map.playerRadius)
      assert.equal(blocked(map,p.x,p.y),false,`Punto bloqueado ${p.x},${p.y}`)
    }
    const step=16; const cols=map.width/step; const rows=map.height/step
    const visited=new Set<number>(); const queue:number[]=[]
    const start=Math.floor(points[0].y/step)*cols+Math.floor(points[0].x/step)
    visited.add(start);queue.push(start)
    for(let i=0;i<queue.length;i++) {
      const current=queue[i];const x=current%cols;const y=Math.floor(current/cols)
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx;const ny=y+dy;const key=ny*cols+nx
        if(nx<0||ny<0||nx>=cols||ny>=rows||visited.has(key))continue
        if(blocked(map,nx*step+step/2,ny*step+step/2))continue
        visited.add(key);queue.push(key)
      }
    }
    for(const p of points) assert.ok(visited.has(Math.floor(p.y/step)*cols+Math.floor(p.x/step)),`Punto sin ruta ${p.x},${p.y}`)
    // Characters stop at the same solid rectangles used by the art.
    const obstacle=map.obstacles[4]
    const before={x:obstacle.x-32,y:obstacle.y+obstacle.height/2}
    const moved=moveInsideArena(before,64,0,map)
    assert.ok(moved.x <= obstacle.x-map.playerRadius)
  })
}

test('el escenario es independiente de la capacidad y lo decide el servidor', async () => {
  assert.equal(normalizeEnvironment('unknown'),'desert')
  assert.equal(normalizeEnvironment({environment:'industrial'}),'desert')
  for(const maxPlayers of [4,10,20]) {
    const room=new ArenaRoom()
    try {
      await room.onCreate({maxPlayers,environment:'industrial'})
      assert.equal(room.state.environment,'industrial')
      assert.equal(room.state.maxPlayers,maxPlayers)
      assert.equal(room['arenaMap'].environment,'industrial')
      assert.equal(room.state.toJSON().environment,'industrial')
    } finally {
      room.setSimulationInterval(undefined as unknown as () => void)
      clearInterval((room as unknown as { _patchInterval?: ReturnType<typeof setInterval> })._patchInterval)
      room.onDispose()
    }
  }
})

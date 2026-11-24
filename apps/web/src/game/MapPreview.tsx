import type { ArenaMapConfig } from './arenaMaps'

export default function MapPreview({ map }: { map: ArenaMapConfig }) {
  return <svg className={`map-preview is-${map.environment}`} viewBox={`0 0 ${map.width} ${map.height}`}
    role="img" aria-label={`Plano de ${map.label}, ${map.maxPlayers} jugadores`}>
    <rect width={map.width} height={map.height} className="map-preview-ground" />
    {map.routes.map((r,index) => <rect key={`route-${index}`} {...r} className="map-preview-route" />)}
    {map.obstacles.map((r,index) => <rect key={`solid-${index}`} x={r.x} y={r.y} width={r.width} height={r.height} className="map-preview-solid" />)}
    {map.spawnPoints.map((p,index) => <circle key={`spawn-${index}`} cx={p.x} cy={p.y} r="18" className="map-preview-spawn" />)}
    {map.pickupSpawnPoints.map((p,index) => <circle key={`pickup-${index}`} cx={p.x} cy={p.y} r="16" className="map-preview-pickup" />)}
  </svg>
}

# Contrato cliente-servidor actual

Protocolo vigente de acceso, salas múltiples, controles, mensajes y estado de arena. La planificación y las pruebas del sprint 1 conservan el historial del prototipo.

## Entrada, salas públicas/privadas y salida

```ts
// Crear sala nueva (pública o privada, capacidad 4, 10 o 20 jugadores)
create('arena', {
  accessToken,
  skin: 'fox',
  weapon: 'rifle',
  maxPlayers: 10,
  environment: 'industrial',
  gameMode: 'tdm', // 'ffa' | 'tdm' | 'gungame' | 'practice'
  isPrivate: false,
  roomName: 'Duelo del desierto',
})

// Unirse a una sala existente por su código de 6 caracteres (incluso en curso)
joinById('K7MP2A', { accessToken, skin: 'mouse', weapon: 'smg' })
```

El cliente recupera la sesión actual de Supabase antes de conectar. `ArenaRoom.onAuth` verifica el token mediante `auth.getUser(token)` y consulta `public.profiles` con ese JWT, sujeto a RLS. Rechaza token ausente, inválido o vencido, cuentas anónimas y perfiles sin username válido. El nombre de la arena procede del perfil; enviar `name` o `userId` no determina la identidad.

La cuenta se identifica por su UUID de Supabase en una asociación privada del servidor. `Player.id` continúa siendo `client.sessionId`. No se sincronizan UUID de cuenta, correos ni tokens en `ArenaState`. Las opciones de skin y arma se validan contra weapons.json; se usan fox/rifle como respaldo y el color se deriva de la skin.

### Salas múltiples y consulta pública

- Cada sala creada recibe un código único de 6 caracteres (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) asignado en `roomId` y publicado en `ArenaState.roomCode`. Se aplica un límite global de 50 salas activas simultáneas (`autoDispose = true` al quedar vacías).
- El escenario y el modo de juego se eligen independientemente de la capacidad: `environment` acepta `desert` o `industrial` (predeterminado `desert`); `gameMode` acepta `ffa` (Todos contra todos), `tdm` (Duelo por equipos), `gungame` (Juego de armas) o `practice` (Campo de tiro individual). El servidor sincroniza ambos en estado y metadatos. Ver [mapas y geometría](mapas.md).
- En modo `practice` (**Campo de tiro**): el servidor fuerza `maxPlayers = 1`, `mapSize = 'small'`, `isPrivate = true`, `killsToWin = 0` y `timeRemaining = 0`; inicia automáticamente en `phase = 'playing'` sin reloj ni escritura en `ResultStore`/rankings, y queda excluido de `GET /api/rooms`. Aparecen 4 NPCs (`Player.isBot = true`, fijos y patrulleros) que reaparecen en `1.5 s` y se curan tras `6 s` sin recibir daño, 5 estaciones de power-ups con reaparición cada `4 s` y 2 pickups de armas de muestra.
- La capacidad y el tamaño se emparejan automáticamente en el servidor:
  - `4` jugadores → mapa **Pequeño** (`small`, `1024 × 768`, `4` apariciones).
  - `10` jugadores → mapa **Mediano** (`medium`, `1600 × 1152`, `10` apariciones).
  - `20` jugadores → mapa **Grande** (`large`, `2240 × 1600`, `20` apariciones).
  - Los pickups de armas, los power-ups y el Power-Up Dorado aparecen en **posiciones aleatorias libres de obstáculos**, y tanto la frecuencia como el máximo simultáneo de objetos **aumentan automáticamente conforme hay más jugadores** en la sala.
- `GET /api/rooms` devuelve `{ rooms }` con las salas **públicas** (`isPrivate = false`), desbloqueadas, en espera o en curso (`phase !== 'finished'`) y con plazas disponibles (`code`, `name`, `mapSize`, `environment`, `gameMode`, `clients`, `maxClients`, `phase`, `hostName`).
- Una cuenta no puede ocupar varias plazas dentro de la misma sala. El anfitrión inicia manualmente con dos participantes; **se permite unirse a partidas ya empezadas** mientras existan plazas disponibles (hasta 20 participantes únicos por partida) y la sala se bloquea al terminar (`finished`).

## Mensajes

| Mensaje | Dirección | Contenido | Uso |
| --- | --- | --- | --- |
| input | Cliente → Servidor | { moveX, moveY, aimAngle, shoot?, melee?, reload?, dash?, seq? } | Movimiento, apuntado, disparo, melé rápido, recarga, dash y secuencia (`uint32`) para reconciliación |
| emote | Cliente → Servidor | `dots`, `alert` o `custom` | Expresión temporal de 2 segundos: `dots` muestra risa, `alert` un corazón y `custom` el emote personalizado verificado (`Player.hasCustomEmote`) |
| start | Cliente → Servidor | Sin contenido | Solo anfitrión, en espera y con al menos dos jugadores |
| rematch | Cliente → Servidor | Sin contenido | Solo anfitrión; vuelve de resultados a espera, salvo guardado en curso o fallo de disco |
| auth_refresh | Cliente → Servidor | { accessToken } | Verificar un token renovado para la misma cuenta |
| practice_action | Cliente → Servidor | { action: 'equip_weapon', weapon } o `'refill' \| 'self_damage' \| 'reset_dummies' \| 'toggle_dummy_shield'` | Utilidades autoritativas del Campo de tiro (`B` / botón `Arsenal`); lista blanca estricta y cooldown de `100 ms` (ignorado fuera de `practice`) |
| explosion | Servidor → Clientes | { x, y, radius } | Evento visual/sonoro de detonación del lanzagranadas al impactar |
| damage_feedback | Servidor → Cliente | { x, y, damage, blocked, weaponType } | Números flotantes de daño o aviso `ESCUDO` para el atacante al impactar NPCs en `practice` |
| custom_emote_asset | Servidor → Clientes | { sessionId, dataUrl } | Sticker WebP validado en servidor por `client.sessionId` para emotes personalizados, sin exponer UUID ni ruta de Storage |

Cada eje `moveX`/`moveY` acepta números finitos continuos en `[-1, 1]` (teclado `-1`/`0`/`1`, sticks analógicos o joystick táctil en cualquier ángulo). El servidor limita la magnitud del vector de desplazamiento a `1.0` para mantener el tope de `220 unidades/s` (y `880 unidades/s` durante un dash de `160 ms`). `aimAngle` debe ser finito en `[-π, π)`. `shoot`, `melee`, `reload` y `dash`, si se incluyen, deben ser booleanos; `seq`, si se incluye, debe ser entero `uint32` en `[0, 4294967295]`. Se rechazan entradas inválidas completas. Posiciones enviadas por el cliente no son autoridad: el cliente usa `packages/shared/movement.ts` (`LocalPlayerPredictor`) para predicción visual instantánea y reconciliación suave con `Player.lastInputSeq`, pero el servidor aplica autoritativamente cadencia, cargadores, recarga, daño (`shotgun` con `4` perdigones y dispersión `6°`, `sniper = 100`, `axe = 90`, `launcher = 75` con radio explosivo de `128 px` y atenuación por distancia), impacto contra hitbox circular centrado en el torso (`PLAYER_HIT_RADIUS = 23`, `PLAYER_HITBOX_OFFSET_Y = -20` para alinear con el sprite de `80×80` y el cañón), obstáculos (intersección analítica segmento-AABB), power-ups, eliminaciones y reaparición. Los jugadores no se bloquean entre sí.

En el cliente se admiten tres modos de entrada con envío adaptativo (hasta `20 Hz` al moverse, disparar o cambiar de estado; sin paquetes redundantes en reposo absoluto):
- **Detección automática de modo por defecto**: mediante User-Agent Client Hints (`navigator.userAgentData`), heurísticas de iPadOS/User-Agent y media queries primarias de puntero, teléfonos y tablets activan los controles táctiles por defecto, mientras que PCs y laptops (incluidas laptops con pantalla táctil o monitores táctiles) inician con teclado y ratón por defecto sin deshabilitar el botón manual `Táctil ON/OFF`.
- **PC (personalizable)**: controles configurables desde el popup modal del lobby o el menú `Esc`, visibles en la leyenda mientras esperas en sala (se oculta al iniciar la partida; predeterminados: `WASD` mover, clic izq. disparar, clic der. melé rápido, `R` recargar, `Espacio` dash, `1`/`2`/`3` emotes, `Esc` menú).
- **Móvil/tablet (estilo Brawl Stars y personalizable)**: joystick izquierdo (`MOVER`); a la derecha botón de disparo con **origen flotante y deadzone** (`20 px` para diferenciar autoapuntado vs arrastre manual, `14 px` zona de cancelación), **`DASH`**, **`MELÉ`**, **`REC`** y bandeja de hasta 3 emotes (incluyendo el personalizado si existe). Además, desde el editor visual del lobby o menú se pueden reposicionar y escalar libremente los controles por orientación (`horizontal` / `vertical`).
- **Persistencia por dispositivo en Supabase**: cada navegador/dispositivo genera un `device_key` UUID acompañado del tipo detectado (`desktop` | `mobile` | `tablet`) y guarda `pc_controls` / `touch_layout` en `public.user_device_controls` (bajo RLS estricta por cuenta, límite de 20 dispositivos y respaldo inmediato en `localStorage`), aislando configuraciones de PC, móvil y tablet aunque compartan cuenta.
- **Mando USB/Bluetooth**: Gamepad API (`RT`/`RB` disparo, `B`/`R3` melé, `X` recarga, `A` dash).

## Sesión durante el juego

El servidor programa la desconexión al vencer el token verificado. Cuando Supabase renueva la sesión, el cliente envía auth_refresh. El servidor vuelve a verificar token y perfil, exige la misma cuenta y actualiza el vencimiento. Limita estas verificaciones a una en curso por conexión y una solicitud cada cinco segundos. Una renovación inválida o cambio de cuenta cierra con código 4001. Al salir o destruir la sala se cancelan los temporizadores.

La etiqueta de jugador conserva el username con el que entró a la ronda. Los cambios desde el perfil se aplican al siguiente ingreso. No se consulta Supabase en cada paso de simulación. El cierre de sesión desde otros dispositivos no invalida inmediatamente un JWT ya emitido; la conexión depende del vencimiento, la renovación y el cierre del cliente. Usar HTTPS/WSS al desplegar.

## Estado y parámetros

- Player: ID de conexión, nombre, bandera `isBot` (`boolean`), posición (`float32`), ángulo (`float32` cuantizado en servidor), skin, color/equipo (`team` en `tdm`), arma inicial y actual, munición en cargador y reserva (`reserveAmmo`, `uint16`), estado de recarga (`isReloading`, `reloadProgress` cuantizado), vida (`uint8`), escudo temporal irrompible por disparos (`shield`, `shieldRemaining`, `shieldProgress` cuantizado), aura dorada (`goldenRemaining`), dashes (`dashes`/`maxDashes`, `dashRechargeProgress` cuantizado, `dashSeq`, `dashAngle`), nivel de Juego de armas (`weaponTier`), bajas/muertes (`uint16`), estado de muerte, emote (`dots`/`alert`/`custom`), bandera `hasCustomEmote`, secuencia melé y `lastInputSeq` (`@view() @type('uint32')`, enviado únicamente al cliente dueño).
- BulletState y eventos: los proyectiles sincronizan origen `(x, y)` (`float32`), velocidad entera `(vx, vy)` (`int16`) y ángulo al nacer; el cliente extrapola su avance a 60 FPS hasta el obstáculo/eliminación y el servidor avanza `simX`/`simY` internamente sin reenviar posiciones por tick. En mapas mediano y grande, `bullets` (`StateView`) y los eventos `explosion` aplican filtrado espacial (*interest management*) por proximidad/trayectoria.
- ArenaState: `roomCode`, `roomName`, `environment`, `gameMode`, `mapSize`, `maxPlayers` (`uint8`), `isPrivate`, `hostId` (conexión), `notice`, `announcement`, `saveStatus`, `resultSummary` (JSON de resultados sin UUID de cuenta), `finishReason`, `phase`, `timeRemaining` (`uint16`, actualizado una vez por segundo entero), `killsToWin`, `orangeScore`, `blueScore`, `winnerId`, `winnerName`, además de mapas de jugadores, balas filtradas por visor, pickups de armas y `powerUps` (`ammo`, `medkit`, `shield`, `dash`, `golden`). Los campos `isPaused`/`pausedByName` permanecen en el esquema por compatibilidad y no pausan partidas.
- Cliente web: `App.tsx` entrega instantáneas de mundo directamente a `ArenaScene` sin disparar re-renders de React a 20 Hz (`hudState.ts` actualiza el DOM solo ante cambios discretos de HUD), `ArenaScene` cachea el fondo/obstáculos del minimapa en una capa estática y filtra VFX/SFX fuera de pantalla.
- Fuentes: `packages/shared/arena.json`, `packages/shared/mapCatalog.ts`, `packages/shared/weapons.json`, `packages/shared/gameplay.ts` y `packages/shared/movement.ts`.

Simulación: 30 Hz. Publicación: 20 Hz. Entradas: 20 Hz. Caducidad: 300 ms. Velocidad máxima: 220 unidades/s (dash: 880 unidades/s durante 160 ms, hasta 5 cargas, recarga automática de 1 carga cada 10 s y tope de 5 incluso con recargas del mapa). Mundo: `1024 × 768` (pequeño), `1600 × 1152` (mediano) o `2240 × 1600` (grande), colisión de jugador contra muros radio `14`, hitbox de daño radio `23` centrado en `y - 20` y obstáculos por tamaño.

Ronda: 300 segundos o meta del modo (`20` kills en FFA, `25`/`40`/`60` bajas de equipo en TDM, `10` armas hasta el cuchillo en Juego de armas). Power-ups (spawn aleatorio libre de obstáculos escalado por jugadores): cargador extra, botiquín (+50 HP), escudo temporal de 5 s (no se rompe con disparos, solo al expirar), recarga de dash (+1 hasta 5) y Power-Up Dorado único por partida cerca del final (spawn aleatorio resaltado en minimapa; 100 HP, escudo temporal y munición infinita durante 15 s). Victoria/empate/derrota: 3/1/0. `Tab` en PC (o botón `Marcador`) y botón de estadísticas junto a `Menú` en móvil muestran la tabla en vivo; ESC (o Start en mando / botón `Menú` en móvil) abre un menú local sin detener el servidor. Los resultados incluyen abandonos aunque su conexión ya no exista. `saveStatus` puede ser `saving`, `pending`, `saved` o `failed`; una revancha crea un nuevo UUID al iniciar. Ver [persistencia, RPC y activación](rankings.md).

## Evidencia y pendientes

Compilación web y TypeScript del servidor correctos. Las pruebas unitarias de cliente y servidor pasan con gateways/servicios simulados. Se comprobó contra Colyseus en producción que nombre/userId sin token se rechazan con `AUTH_FAILED` y que `GET /api/rooms` responde con `Cache-Control: no-store`. La prueba completa con múltiples jugadores reales en mapas mediano/grande y controles táctiles/mando queda lista para validación en dispositivos. Ver [guía y estado de autenticación](autenticacion-supabase.md) y [estado actual](estado-actual.md).

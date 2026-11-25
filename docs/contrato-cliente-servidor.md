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
  gameMode: 'tdm', // 'ffa' | 'tdm' | 'gungame'
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
- El escenario y el modo de juego se eligen independientemente de la capacidad: `environment` acepta `desert` o `industrial` (predeterminado `desert`); `gameMode` acepta `ffa` (Todos contra todos), `tdm` (Duelo por equipos) o `gungame` (Juego de armas). El servidor sincroniza ambos en estado y metadatos. Ver [mapas y geometría](mapas.md).
- La capacidad y el tamaño se emparejan automáticamente en el servidor:
  - `4` jugadores → mapa **Pequeño** (`small`, `1024 × 768`, `4` apariciones, `2` armas cada `15 s`, `4` puntos de power-ups).
  - `10` jugadores → mapa **Mediano** (`medium`, `1600 × 1152`, `10` apariciones, `4` armas cada `11 s`, `6` puntos de power-ups).
  - `20` jugadores → mapa **Grande** (`large`, `2240 × 1600`, `20` apariciones, `8` armas cada `8 s`, `8` puntos de power-ups).
- `GET /api/rooms` devuelve `{ rooms }` con las salas **públicas** (`isPrivate = false`), desbloqueadas, en espera o en curso (`phase !== 'finished'`) y con plazas disponibles (`code`, `name`, `mapSize`, `environment`, `gameMode`, `clients`, `maxClients`, `phase`, `hostName`).
- Una cuenta no puede ocupar varias plazas dentro de la misma sala. El anfitrión inicia manualmente con dos participantes; **se permite unirse a partidas ya empezadas** mientras existan plazas disponibles (hasta 20 participantes únicos por partida) y la sala se bloquea al terminar (`finished`).

## Mensajes

| Mensaje | Contenido | Uso |
| --- | --- | --- |
| input | { moveX, moveY, aimAngle, shoot?, melee?, reload?, dash? } | Movimiento, apuntado, disparo, melé rápido, recarga y dash |
| emote | dots o alert | Expresión temporal de 2 segundos: `dots` muestra risa (tecla 1) y `alert` un corazón (tecla 2). Se conservan los identificadores del protocolo. |
| start | Sin contenido | Solo anfitrión, en espera y con al menos dos jugadores |
| rematch | Sin contenido | Solo anfitrión; vuelve de resultados a espera, salvo guardado en curso o fallo de disco |
| auth_refresh | { accessToken } | Verificar un token renovado para la misma cuenta |

Cada eje `moveX`/`moveY` acepta números finitos continuos en `[-1, 1]` (teclado `-1`/`0`/`1`, sticks analógicos o joystick táctil en cualquier ángulo). El servidor limita la magnitud del vector de desplazamiento a `1.0` para mantener el tope de `220 unidades/s` (y `880 unidades/s` durante un dash de `160 ms`). `aimAngle` debe ser finito en `[-π, π)`. `shoot`, `melee`, `reload` y `dash`, si se incluyen, deben ser booleanos. Se rechazan entradas inválidas completas. Posiciones enviadas por el cliente no son autoridad. El servidor aplica cadencia, cargadores, recarga, daño (`sniper = 100`, `axe = 90`), obstáculos, power-ups, eliminaciones y reaparición. Los jugadores no se bloquean entre sí.

En el cliente se admiten tres modos de entrada con la misma frecuencia de envío (`20 Hz`): teclado/ratón con *Pointer Lock* (WASD, clic izq. disparo, clic der. melé rápido, `R` recarga, `Espacio` dash), controles táctiles gemelos en móvil/tablet (con botones `DISPARO`, `MELÉ`, `REC` y `DASH`) y mandos USB/Bluetooth mediante Gamepad API (`RT`/`RB` disparo, `B` melé, `X` recarga, `A` dash).

## Sesión durante el juego

El servidor programa la desconexión al vencer el token verificado. Cuando Supabase renueva la sesión, el cliente envía auth_refresh. El servidor vuelve a verificar token y perfil, exige la misma cuenta y actualiza el vencimiento. Limita estas verificaciones a una en curso por conexión y una solicitud cada cinco segundos. Una renovación inválida o cambio de cuenta cierra con código 4001. Al salir o destruir la sala se cancelan los temporizadores.

La etiqueta de jugador conserva el username con el que entró a la ronda. Los cambios desde el perfil se aplican al siguiente ingreso. No se consulta Supabase en cada paso de simulación. El cierre de sesión desde otros dispositivos no invalida inmediatamente un JWT ya emitido; la conexión depende del vencimiento, la renovación y el cierre del cliente. Usar HTTPS/WSS al desplegar.

## Estado y parámetros

- Player: ID de conexión, nombre, posición, ángulo, skin, color/equipo (`team` en `tdm`), arma inicial y actual, munición en cargador y reserva (`reserveAmmo`), estado de recarga (`isReloading`, `reloadProgress`), vida, escudo temporal (`shield`, `shieldRemaining`), aura dorada (`goldenRemaining`), dashes (`dashes`/`maxDashes`, `dashSeq`, `dashAngle`), nivel de Juego de armas (`weaponTier`), bajas, muertes, estado de muerte, emote y secuencia melé.
- ArenaState: `roomCode`, `roomName`, `environment`, `gameMode`, `mapSize`, `maxPlayers`, `isPrivate`, `hostId` (conexión), `notice`, `announcement`, `saveStatus`, `resultSummary` (JSON de resultados sin UUID de cuenta), `finishReason`, `phase`, `timeRemaining`, `killsToWin`, `orangeScore`, `blueScore`, `winnerId`, `winnerName`, además de mapas de jugadores, balas, pickups de armas y `powerUps` (`ammo`, `medkit`, `shield`, `dash`, `golden`). Los campos `isPaused`/`pausedByName` permanecen en el esquema por compatibilidad y no pausan partidas.
- Fuentes: `packages/shared/arena.json`, `packages/shared/mapCatalog.ts`, `packages/shared/weapons.json` y `packages/shared/gameplay.ts`.

Simulación: 30 Hz. Publicación: 20 Hz. Entradas: 20 Hz. Caducidad: 300 ms. Velocidad máxima: 220 unidades/s (dash: 880 unidades/s durante 160 ms, 5 cargas por partida, tope de 5 incluso con recargas del mapa). Mundo: `1024 × 768` (pequeño), `1600 × 1152` (mediano) o `2240 × 1600` (grande), radio 14 y obstáculos por tamaño.

Ronda: 300 segundos o meta del modo (`20` kills en FFA, `25`/`40`/`60` bajas de equipo en TDM, `10` armas hasta el cuchillo en Juego de armas). Power-ups: cargador extra, botiquín (+50 HP), escudo temporal (10 s), recarga de dash (+1 hasta 5) y Power-Up Dorado único por partida cerca del final (resaltado en minimapa; 100 HP, escudo y munición infinita durante 15 s). Victoria/empate/derrota: 3/1/0. ESC (o Start en mando / botón Menú en móvil) abre un menú local sin detener el servidor. Los resultados incluyen abandonos aunque su conexión ya no exista. `saveStatus` puede ser `saving`, `pending`, `saved` o `failed`; una revancha crea un nuevo UUID al iniciar. Ver [persistencia, RPC y activación](rankings.md).

## Evidencia y pendientes

Compilación web y TypeScript del servidor correctos. Las pruebas unitarias de cliente y servidor pasan con gateways/servicios simulados. Se comprobó contra Colyseus en producción que nombre/userId sin token se rechazan con `AUTH_FAILED` y que `GET /api/rooms` responde con `Cache-Control: no-store`. La prueba completa con múltiples jugadores reales en mapas mediano/grande y controles táctiles/mando queda lista para validación en dispositivos. Ver [guía y estado de autenticación](autenticacion-supabase.md) y [estado actual](estado-actual.md).

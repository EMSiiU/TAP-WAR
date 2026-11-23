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
  isPrivate: false,
  roomName: 'Duelo del desierto',
})

// Unirse a una sala existente por su código de 6 caracteres
joinById('K7MP2A', { accessToken, skin: 'mouse', weapon: 'smg' })
```

El cliente recupera la sesión actual de Supabase antes de conectar. `ArenaRoom.onAuth` verifica el token mediante `auth.getUser(token)` y consulta `public.profiles` con ese JWT, sujeto a RLS. Rechaza token ausente, inválido o vencido, cuentas anónimas y perfiles sin username válido. El nombre de la arena procede del perfil; enviar `name` o `userId` no determina la identidad.

La cuenta se identifica por su UUID de Supabase en una asociación privada del servidor. `Player.id` continúa siendo `client.sessionId`. No se sincronizan UUID de cuenta, correos ni tokens en `ArenaState`. Las opciones de skin y arma se validan contra weapons.json; se usan fox/rifle como respaldo y el color se deriva de la skin.

### Salas múltiples y consulta pública

- Cada sala creada recibe un código único de 6 caracteres (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) asignado en `roomId` y publicado en `ArenaState.roomCode`. Se aplica un límite global de 50 salas activas simultáneas (`autoDispose = true` al quedar vacías).
- La capacidad y el mapa se emparejan automáticamente en el servidor:
  - `4` jugadores → mapa **Pequeño** (`small`, `1024 × 768`, `4` apariciones, `2` pickups cada `15 s`).
  - `10` jugadores → mapa **Mediano** (`medium`, `1600 × 1152`, `10` apariciones, `4` pickups cada `11 s`).
  - `20` jugadores → mapa **Grande** (`large`, `2240 × 1600`, `20` apariciones, `8` pickups cada `8 s`).
- `GET /api/rooms` devuelve `{ rooms }` con las salas **públicas** (`isPrivate = false`), desbloqueadas y con plazas disponibles (`code`, `name`, `mapSize`, `clients`, `maxClients`, `phase`, `hostName`).
- Una cuenta no puede ocupar varias plazas dentro de la misma sala. El anfitrión inicia manualmente con dos participantes; la sala se bloquea durante la ronda y resultados. La desconexión durante la ronda supone abandono inmediato, sin reconexión automática.

## Mensajes

| Mensaje | Contenido | Uso |
| --- | --- | --- |
| input | { moveX, moveY, aimAngle, shoot? } | Movimiento, apuntado y ataque |
| emote | dots o alert | Expresión temporal |
| start | Sin contenido | Solo anfitrión, en espera y con al menos dos jugadores |
| rematch | Sin contenido | Solo anfitrión; vuelve de resultados a espera, salvo guardado en curso o fallo de disco |
| auth_refresh | { accessToken } | Verificar un token renovado para la misma cuenta |

Cada eje `moveX`/`moveY` acepta números finitos continuos en `[-1, 1]` (teclado `-1`/`0`/`1`, sticks analógicos o joystick táctil en cualquier ángulo). El servidor limita la magnitud del vector de desplazamiento a `1.0` para mantener el tope de `220 unidades/s`. `aimAngle` debe ser finito en `[-π, π)`. `shoot`, si se incluye, debe ser booleano. Se rechazan entradas inválidas completas. Posiciones enviadas por el cliente no son autoridad. El servidor aplica cadencia, munición, daño, obstáculos, eliminaciones y reaparición. Los jugadores no se bloquean entre sí.

En el cliente se admiten tres modos de entrada con la misma frecuencia de envío (`20 Hz`): teclado/ratón con *Pointer Lock*, controles táctiles gemelos en móvil/tablet (con botón de pantalla completa) y mandos USB/Bluetooth mediante Gamepad API.

## Sesión durante el juego

El servidor programa la desconexión al vencer el token verificado. Cuando Supabase renueva la sesión, el cliente envía auth_refresh. El servidor vuelve a verificar token y perfil, exige la misma cuenta y actualiza el vencimiento. Limita estas verificaciones a una en curso por conexión y una solicitud cada cinco segundos. Una renovación inválida o cambio de cuenta cierra con código 4001. Al salir o destruir la sala se cancelan los temporizadores.

La etiqueta de jugador conserva el username con el que entró a la ronda. Los cambios desde el perfil se aplican al siguiente ingreso. No se consulta Supabase en cada paso de simulación. El cierre de sesión desde otros dispositivos no invalida inmediatamente un JWT ya emitido; la conexión depende del vencimiento, la renovación y el cierre del cliente. Usar HTTPS/WSS al desplegar.

## Estado y parámetros

- Player: ID de conexión, nombre, posición, ángulo, skin, equipo visual, arma inicial y actual, munición, vida, bajas, muertes, estado de muerte, emote y secuencia melé.
- ArenaState: `roomCode`, `roomName`, `mapSize`, `maxPlayers`, `isPrivate`, `phase`, `hostId` (conexión), `timeRemaining`, `killsToWin`, `winnerId`, `winnerName`, `finishReason`, `notice`, `saveStatus` y `resultSummary` (JSON de resultados sin UUID de cuenta), además de mapas de jugadores, balas y pickups. Los campos `isPaused`/`pausedByName` permanecen en el esquema por compatibilidad y no pausan partidas.
- Fuentes: `packages/shared/arena.json` y `packages/shared/weapons.json`.

Simulación: 30 Hz. Publicación: 20 Hz. Entradas: 20 Hz. Caducidad: 300 ms. Velocidad máxima: 220 unidades/s. Mundo: `1024 × 768` (pequeño), `1600 × 1152` (mediano) o `2240 × 1600` (grande), radio 14 y obstáculos por tamaño.

Ronda: 300 segundos o 20 kills. Tiempo: más kills, luego menos muertes, empate entre líderes iguales. Victoria/empate/derrota: 3/1/0. ESC (o Start en mando / botón Menú en móvil) abre un menú local sin detener el servidor. Los resultados incluyen abandonos aunque su conexión ya no exista. `saveStatus` puede ser `saving`, `pending`, `saved` o `failed`; una revancha crea un nuevo UUID al iniciar. Ver [persistencia, RPC y activación](rankings.md).

## Evidencia y pendientes

Compilación web y TypeScript del servidor correctos. Las pruebas unitarias de cliente y servidor pasan con gateways/servicios simulados. Se comprobó contra Colyseus en producción que nombre/userId sin token se rechazan con `AUTH_FAILED` y que `GET /api/rooms` responde con `Cache-Control: no-store`. La prueba completa con múltiples jugadores reales en mapas mediano/grande y controles táctiles/mando queda lista para validación en dispositivos. Ver [guía y estado de autenticación](autenticacion-supabase.md) y [estado actual](estado-actual.md).

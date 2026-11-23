# Contrato cliente-servidor actual

Protocolo vigente de acceso, mensajes y estado de arena. La planificación y las pruebas del sprint 1 conservan el historial del prototipo.

## Entrada y salida

```ts
joinById('arena-local', { accessToken, skin: 'fox', weapon: 'rifle' })
```

El cliente recupera la sesión actual de Supabase antes de conectar. `ArenaRoom.onAuth` verifica el token mediante `auth.getUser(token)` y consulta `public.profiles` con ese JWT, sujeto a RLS. Rechaza token ausente, inválido o vencido, cuentas anónimas y perfiles sin username válido. El nombre de la arena procede del perfil; enviar `name` o `userId` no determina la identidad.

La cuenta se identifica por su UUID de Supabase en una asociación privada del servidor. `Player.id` continúa siendo `client.sessionId`. No se sincronizan UUID de cuenta, correos ni tokens en `ArenaState`. Las opciones de skin y arma se validan contra weapons.json; se usan fox/rifle como respaldo y el color se deriva de la skin.

Sala de cuatro conexiones, sin reconexión automática. Salir de la arena vuelve al perfil/lobby y conserva la sesión de cuenta. Cerrar sesión desmonta la arena y cierra su conexión antes de cerrar la sesión local de Supabase. Una cuenta no puede ocupar varias plazas. El anfitrión inicia manualmente con dos participantes; la sala se bloquea durante la ronda y resultados. La desconexión durante la ronda supone abandono inmediato.

## Mensajes

| Mensaje | Contenido | Uso |
| --- | --- | --- |
| input | { moveX, moveY, aimAngle, shoot? } | Movimiento, apuntado y ataque |
| emote | dots o alert | Expresión temporal |
| start | Sin contenido | Solo anfitrión, en espera y con al menos dos jugadores |
| rematch | Sin contenido | Solo anfitrión; vuelve de resultados a espera, salvo guardado en curso o fallo de disco |
| auth_refresh | { accessToken } | Verificar un token renovado para la misma cuenta |

Cada eje acepta -1, 0 o 1. aimAngle debe ser finito en [-π, π). shoot, si se incluye, debe ser booleano. Se rechazan entradas inválidas completas. Posiciones enviadas por el cliente no son autoridad. El servidor aplica cadencia, munición, daño, obstáculos, eliminaciones y reaparición. Los jugadores no se bloquean entre sí.

## Sesión durante el juego

El servidor programa la desconexión al vencer el token verificado. Cuando Supabase renueva la sesión, el cliente envía auth_refresh. El servidor vuelve a verificar token y perfil, exige la misma cuenta y actualiza el vencimiento. Limita estas verificaciones a una en curso por conexión y una solicitud cada cinco segundos. Una renovación inválida o cambio de cuenta cierra con código 4001. Al salir o destruir la sala se cancelan los temporizadores.

La etiqueta de jugador conserva el username con el que entró a la ronda. Los cambios desde el perfil se aplican al siguiente ingreso. No se consulta Supabase en cada paso de simulación. El cierre de sesión desde otros dispositivos no invalida inmediatamente un JWT ya emitido; la conexión depende del vencimiento, la renovación y el cierre del cliente. Usar HTTPS/WSS al desplegar.

## Estado y parámetros

- Player: ID de conexión, nombre, posición, ángulo, skin, equipo visual, arma inicial y actual, munición, vida, bajas, muertes, estado de muerte, emote y secuencia melé.
- ArenaState: fase, hostId (conexión), tiempo restante, meta, ganador, finishReason, notice, saveStatus y resultSummary (JSON de resultados sin UUID de cuenta), además de mapas de jugadores, balas y pickups. Los campos isPaused/pausedByName permanecen en el esquema por compatibilidad y no pausan partidas.
- Fuentes: packages/shared/arena.json y packages/shared/weapons.json.

Simulación: 30 Hz. Publicación: 20 Hz. Entradas: 20 Hz. Caducidad: 300 ms. Velocidad: 220 unidades/s con diagonal normalizada. Mundo: 1024 × 768, radio 14 y cuatro apariciones. El mapa actual contiene varios obstáculos.

Ronda: 300 segundos o 20 kills. Tiempo: más kills, luego menos muertes, empate entre líderes iguales. Victoria/empate/derrota: 3/1/0. ESC es un menú local sin detener el servidor. Los resultados incluyen abandonos aunque su conexión ya no exista. saveStatus puede ser saving, pending, saved o failed; una revancha crea un nuevo UUID al iniciar. Ver [persistencia, RPC y activación](rankings.md).

## Evidencia y pendientes

Compilación web y TypeScript del servidor correctos. Veintiséis pruebas automatizadas de autenticación, infraestructura, puntuación y recuperación de resultados pasan, con servicios simulados. Se comprobó contra Colyseus local que nombre/userId sin token se rechazan con AUTH_FAILED. La prueba completa con una cuenta real, la renovación en una sesión prolongada y dos jugadores independientes siguen pendientes. Ver [guía y estado de autenticación](autenticacion-supabase.md).

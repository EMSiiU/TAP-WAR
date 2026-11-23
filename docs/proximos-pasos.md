# Próximos pasos: salas, partidas, estadísticas y rankings

Definición inicial: 20 de noviembre de 2026. Actualizado el 23 de noviembre de 2026. Estado: rankings y persistencia implementados localmente, pendientes de activación remota; salas por código y reconexión pendientes.

## Objetivo

Permitir crear salas con código y unirse a ellas, disputar rondas con resultados persistentes y consultar un ranking global con tablas y gráficas. Desplegar una versión de prueba en Ubuntu para validar conexiones desde redes distintas. Supabase continuará alojado en su servicio.

El [estado actual](estado-actual.md) registra la funcionalidad y las pruebas existentes. El [contrato vigente](contrato-cliente-servidor.md) sigue describiendo el código implementado; se actualizará cuando cambie el protocolo.

## Decisiones confirmadas

| Tema | Acuerdo |
| --- | --- |
| Acceso a salas | Crear sala y compartir un código; otro usuario introduce ese código para unirse |
| Inicio | El creador inicia manualmente con un mínimo de dos jugadores |
| Ranking principal | Puntos acumulados: 3 por victoria, 1 por empate y 0 por derrota |
| Visibilidad | Ranking, fotos y estadísticas globales visibles solo para usuarios autenticados |
| Final normal de ronda | Cinco minutos o victoria inmediata al llegar a 20 kills, lo que ocurra primero |
| Igualdad de puntos globales | Compartir posición; el username puede ordenar visualmente sin modificar el puesto |
| Estadísticas propias | Incluir una sección Mis estadísticas para la cuenta con sesión iniciada |
| Abandono | Cuenta como derrota; si solo queda un participante, ese jugador gana |
| Persistencia | Guardar resultados por cuenta para acumular estadísticas entre partidas |
| Presentación | Mostrar ganador y estadísticas finales; ofrecer ranking global con tablas y gráficas |

Una cuenta se identifica por su UUID de Supabase. Cambiar username no debe borrar estadísticas ni crear otro jugador. Una participación abandonada debe conservarse en el resultado aunque desaparezca su conexión.

## Avance del bloque de rankings

Ver [rankings.md](rankings.md) para activar la migración, configurar la clave privada y comprobar resultados. El código aplica 300 segundos/20 kills, inicio manual, cuenta única, transferencia de anfitrión, bloqueo de entradas durante ronda y cierre por abandono. Conserva participantes retirados y guarda resultados idempotentes con reintentos en disco. El empate por tiempo usa kills y después menos muertes. La numeración global es densa: 1, 1, 2.

Ya están implementados el ranking con fotos, tabla/búsqueda/paginación, top diez y Mis estadísticas con tarjetas, dos gráficas e historial. Los perfiles completos sin partidas aparecen sin clasificar; los incompletos no se incluyen. ESC abre un menú local y no pausa la simulación.

Se mantiene una sola sala fija de cuatro plazas. Salir o perder la conexión supone abandono inmediato; la reconexión con treinta segundos de reserva requiere otro bloque. Las salas por código tampoco están implementadas. Al reiniciar se recuperan cierres pendientes y las rondas abiertas se marcan interrumpidas sin estadísticas competitivas.

Las etapas y garantías siguientes sirven como lista de verificación. Implementación local no equivale a configuración remota ni a prueba de aceptación con dos cuentas reales.

## Experiencia propuesta

### Crear o unirse a sala

Tras acceder y completar el perfil, el lobby ofrece Crear sala y Unirse con código. Crear devuelve un código corto copiable, por ejemplo K7MP2A. El servidor garantiza que no colisiona con otra sala activa y normaliza la entrada del código.

La pantalla de espera muestra código, participantes, capacidad y anfitrión. Solo el creador o quien herede ese rol puede iniciar, y el servidor vuelve a comprobar el mínimo de participantes. Un código inexistente, una sala llena o una partida ya iniciada deben producir mensajes distintos. Un código incorrecto no debe crear otra sala automáticamente.

El anfitrión es un rol de coordinación, no el servidor autoritativo: la simulación continúa en Colyseus. La primera versión no necesita listado público de salas ni emparejamiento automático. El código no reemplaza la autenticación de cuenta.

### Partida y resultados

Al iniciar, congelar la lista de participantes y asignar un UUID de partida independiente del código de sala. El reloj, las bajas, las muertes, la finalización y el ganador se calculan en el servidor.

La pantalla final incluye a todos los participantes, incluso abandonos: posición, username utilizado en la ronda, kills, muertes y resultado. Destaca al ganador o a los jugadores empatados. Una revancha no debe sobrescribir el resultado anterior ni volver a sumar sus puntos.

## Persistencia propuesta

| Entidad | Responsabilidad |
| --- | --- |
| Sala activa | Código, anfitrión y conexiones; no confundir su ciclo de vida con el historial |
| Partida | UUID, inicio, fin, duración efectiva, estado y motivo de finalización |
| Resultado de participante | Partida, UUID de cuenta, username de la ronda, kills, muertes, posición, resultado, puntos y estado de abandono |
| Estadísticas acumuladas | Derivadas de partidas válidas; si se mantienen agregados, deben poder reconstruirse desde los resultados |

### Garantías necesarias

- Únicamente el servidor autorizado puede escribir resultados y puntos. El navegador nunca decide cuántas kills sumar ni quién ganó.
- Una participación es única por partida/cuenta. El cierre y los reintentos deben ser idempotentes: el mismo resultado no cuenta dos veces.
- Guardar el cierre de partida y sus participantes de forma atómica. Definir reintentos y una respuesta visible si el guardado queda pendiente.
- Conservar estadísticas de abandonos antes de retirar conexiones. Clasificar interrupciones de infraestructura separadamente de derrotas.
- No presentar un guardado como exitoso antes de confirmarlo. Los reintentos en memoria no garantizan recuperación después de una caída del proceso; habrá que definir almacenamiento duradero de pendientes o tratar la partida como interrumpida.
- Mantener las políticas privadas de profiles. El ranking necesita una consulta o proyección autorizada que exponga usernames y estadísticas permitidas, sin ampliar indiscriminadamente el acceso a los perfiles.
- La foto actual es privada. Se aprobó mostrarla en rankings a usuarios autenticados; preparar acceso controlado a las fotos actuales sin convertir todo el bucket en público. Las operaciones de modificación seguirán restringidas al propietario.

## Ranking y Mis estadísticas

La ventana tendrá dos secciones: Ranking global y Mis estadísticas. La inclusión de ambas y su acceso solo para usuarios autenticados están confirmados; la distribución visual y las métricas siguientes se implementaron en la primera versión local.

### Ranking global

- Jugadores destacados con foto, username, puesto y puntos. Mostrar el mismo puesto cuando haya igualdad, sin inventar un desempate competitivo.
- Tabla con posición global, foto/username, puntos, partidas, victorias, kills, muertes y porcentaje de victorias.
- Búsqueda por username, paginación y resaltado de la fila de la cuenta actual. Filtrar o cambiar de página no recalcula la posición global.
- Gráfica de barras de los diez jugadores con más puntos.
- Los perfiles completos sin partidas aparecerían al final con valores en cero y Sin clasificar; las cuentas sin username completarían primero el perfil. Esta regla de inclusión está implementada.

El ranking principal usa puntos 3/1/0: puntos = victorias × 3 + empates. La victoria por abandono otorga 3 puntos y el abandono 0. Con igual puntuación se comparte puesto; el orden alfabético solo sirve para presentación. Es una clasificación acumulativa, no un sistema Elo. La numeración implementada es densa: 1, 1, 2.

Las fotos se obtendrán con acceso controlado y enlaces temporales. Si falta una imagen o falla su carga, se mostrará el personaje de respaldo. El ranking consultará datos autorizados, sin ampliar la lectura completa de profiles.

### Mis estadísticas

La cuenta se obtiene de la sesión validada, no de un UUID arbitrario enviado desde el navegador. Esta sección mostrará únicamente las estadísticas personales del usuario actual.

Tarjetas propuestas: puesto global, puntos, partidas, victorias, porcentaje de victorias, kills, muertes y relación K/D. El porcentaje será victorias / partidas válidas × 100; sin partidas se mostrará un guion. Si no hay muertes, K/D mostrará un guion en lugar de dividir entre cero. Los abandonos se incluirán como derrotas y podrán indicarse como dato adicional, sin contarlos dos veces en la distribución de resultados.

Gráficas propuestas:

- Rendimiento: barras agrupadas de kills y muertes en las últimas diez partidas válidas.
- Resultados: distribución de victorias, empates y derrotas, con cantidades y porcentajes.

Tabla de historial: fecha, resultado, kills, muertes, puntos obtenidos y motivo del final (tiempo, 20 kills o abandono). Cada fila representa una partida persistida. Las partidas anuladas/interrumpidas no sumarán puntos; se conservan separadamente en el registro de la partida y se excluyen de las consultas competitivas.

### Actualización y alcance inicial

Actualizar al cargar la ventana y al confirmar el guardado de una partida. Las temporadas, filtros semanales, actualizaciones en tiempo real y gráficas adicionales quedan para después. El historial comienza con las primeras partidas guardadas: las rondas anteriores que solo estuvieron en memoria no se pueden reconstruir.

Se puede implementar persistencia y ranking con la sala actual; las salas por código no son una dependencia técnica obligatoria. Sí es necesario resolver antes el cierre de ronda, conservar participantes retirados, evitar dos plazas de una misma cuenta por partida y garantizar guardado idempotente desde el servidor.

## Etapas y criterios de aceptación

### 1. Validar la base actual

- Probar acceso, perfil, fotos, persistencia de preferencias y logout con cuentas reales.
- Verificar aislamiento entre dos cuentas en perfiles y Storage.
- Registrar resultados reproducibles antes de ampliar el flujo.

### 2. Salas por código

- Crear dos salas simultáneas y comprobar que sus estados están aislados.
- Unirse por código correcto y rechazar códigos inexistentes/salas llenas.
- Solo el anfitrión puede iniciar y solo con al menos dos participantes.
- Verificar capacidad, cuenta repetida, transferencia de anfitrión y eliminación de sala vacía según las reglas aprobadas.

### 3. Ciclo de partida

- Aplicar los cinco minutos y el umbral de 20 kills ya confirmados; cerrar desempates por tiempo y política de pausa antes de implementar.
- Comprobar victoria por abandono y conservación de participantes retirados.
- Si se aprueba reconexión, recuperar la misma participación y estadísticas dentro del plazo; fuera de él, aplicar abandono.
- Una revancha crea otra partida y no altera el resultado anterior.

### 4. Despliegue de prueba en Ubuntu

- Verificar acceso SSH, recursos disponibles, publicación de puertos y conectividad pública; no asumir que una IP de red local es accesible desde Internet.
- Preparar dominio/HTTPS, cliente compilado y Colyseus con comando de producción y reinicio supervisado.
- Configurar proxy con WebSockets seguros y variables de entorno; actualizar retornos/orígenes de Supabase y proveedores OAuth.
- Iniciar con un único proceso de Colyseus para las salas. Varios procesos requieren coordinación compartida adicional.
- Dos personas desde redes distintas crean sala, se unen, juegan y salen correctamente; comprobar también reconexión y reinicio del servicio.

### 5. Resultados persistentes

- Aplicar modelo y permisos tras cerrar reglas de puntuación/validez.
- Finalizar una partida y comprobar que todos sus participantes quedan registrados.
- Repetir el guardado y verificar que no duplica resultados ni puntos.
- Simular fallo de Supabase y reinicio para comprobar la estrategia de pendientes/interrupciones.
- Confirmar que el cliente no puede modificar estadísticas directamente.

### 6. Ranking, historial y gráficas

- Mostrar tabla ordenada por la regla aprobada, búsqueda, paginación y estados sin datos.
- Contrastar puntos y totales con los resultados originales, incluidos empates y abandonos.
- Cambiar username y verificar que se conserva el historial de la cuenta.
- Dibujar las dos gráficas con datos persistidos, no con valores de ejemplo.

### 7. Validación integrada y actualización del despliegue

- Repetir el recorrido desde cuenta hasta ranking con usuarios independientes.
- Registrar partidas de tres y cuatro participantes, abandonos, reconexiones y revanchas.
- Verificar aislamiento entre salas y que el ranking suma una sola vez cada resultado.
- Documentar operación, errores conocidos y despliegue reproducible. No declarar aceptación del equipo sin su revisión.

## Fuera de esta ampliación inicial

SMTP y recuperación siguen pendientes por separado. Tampoco se incluyen todavía Elo, temporadas, torneos, amistades, chat, equipos, espectadores, listado público de salas ni escalado a varios servidores. Su inclusión requiere revisar alcance y permisos.

## Referencias

- [Colyseus: matchmaking](https://docs.colyseus.io/matchmaker).
- [Colyseus: visibilidad y bloqueo de salas](https://docs.colyseus.io/matchmaker/visibility).
- [Colyseus: despliegue](https://docs.colyseus.io/deployment).
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

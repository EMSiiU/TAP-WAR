# Próximos pasos: salas, partidas, estadísticas y rankings

Fecha de definición: 20 de noviembre de 2026. Estado: planificación; este documento no acredita implementación, pruebas ni tareas creadas en el Project.

## Objetivo

Permitir crear salas con código y unirse a ellas, disputar rondas con resultados persistentes y consultar un ranking global con tablas y gráficas. Desplegar una versión de prueba en Ubuntu para validar conexiones desde redes distintas. Supabase continuará alojado en su servicio.

El [estado actual](estado-actual.md) registra la funcionalidad y las pruebas existentes. El [contrato vigente](contrato-cliente-servidor.md) sigue describiendo el código implementado; se actualizará cuando cambie el protocolo.

## Decisiones confirmadas

| Tema | Acuerdo |
| --- | --- |
| Acceso a salas | Crear sala y compartir un código; otro usuario introduce ese código para unirse |
| Inicio | El creador inicia manualmente con un mínimo de dos jugadores |
| Ranking principal | Puntos acumulados: 3 por victoria, 1 por empate y 0 por derrota |
| Abandono | Cuenta como derrota; si solo queda un participante, ese jugador gana |
| Persistencia | Guardar resultados por cuenta para acumular estadísticas entre partidas |
| Presentación | Mostrar ganador y estadísticas finales; ofrecer ranking global con tablas y gráficas |

Una cuenta se identifica por su UUID de Supabase. Cambiar username no debe borrar estadísticas ni crear otro jugador. Una participación abandonada debe conservarse en el resultado aunque desaparezca su conexión.

## Reglas propuestas pendientes de confirmar

| Regla | Propuesta |
| --- | --- |
| Capacidad | Mantener de 2 a 4 jugadores |
| Duración normal | Cinco minutos de juego, eliminando el final anticipado por 10 kills |
| Ganador por tiempo | Más kills; ante igualdad, menos muertes; si ambos coinciden, empate entre quienes comparten el primer puesto |
| Reconexión | Reservar la participación durante 30 segundos ante una desconexión involuntaria |
| Salida voluntaria | Salir de la arena o cerrar sesión durante la ronda supone abandono inmediato |
| Pausa | ESC abre el menú personal; las partidas que cuentan para estadísticas no se pausan globalmente |
| Anfitrión ausente en espera | Transferir el rol a otro participante conectado |
| Incorporación durante ronda | Bloquear nuevos participantes; permitir reconexión de quienes ya estaban |
| Revancha | Conservar sala/código, volver a espera y crear un identificador de partida nuevo al iniciar |
| Cuenta repetida | Una cuenta ocupa una sola plaza por partida |
| Sala vacía | Eliminarla e invalidar su código |
| Caída del servidor | Marcar partida interrumpida, sin asignar puntos ni resultados competitivos |
| Perfiles sin partidas | Mostrar los perfiles con username al final, con estadísticas en cero y sin clasificación |

Estas propuestas no se consideran aprobadas por haber confirmado las tres preguntas de inicio, puntos y abandono. Antes de implementar partidas y rankings, cerrar también: cómo computan las estadísticas de quienes abandonan, cómo se registran empates compartidos y el desempate del ranking cuando dos cuentas tienen los mismos puntos.

Un jugador muerto que espera reaparecer sigue participando. La victoria por abandono se refiere al último participante que permanece en la partida, no al último personaje con vida. Si se aprueba la reconexión, no se declarará ganador mientras el rival conserve su plazo para volver. Si todos abandonan, hace falta definir el estado final y si se conservan estadísticas; no se puede asignar un ganador inexistente.

## Punto de partida del código

- Hay una única sala fija, arena-local, creada al arrancar el servidor.
- El inicio ocurre automáticamente al alcanzar dos jugadores.
- La ronda dura 180 segundos o termina con 10 kills.
- Ya existe pantalla de ganador, kills, muertes, empate y revancha.
- Las estadísticas de ronda están en memoria; se reinician y no alimentan un ranking.
- Al bajar de dos conexiones durante una ronda, el servidor vuelve a espera. Ese comportamiento debe reemplazarse por las reglas de desconexión y abandono.
- La reconexión automática está desactivada. Todavía no se recupera una participación con sus kills, muertes y posición.

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
- La foto actual es privada. Mostrar fotos de otros usuarios en rankings requeriría una decisión adicional de visibilidad y permisos.

## Ranking y gráficas

El ranking principal confirmado usa puntos 3/1/0. La fórmula propuesta es puntos = victorias × 3 + empates. El significado de empate y la validez de una partida deben cerrarse antes de implementarla. La victoria por abandono otorgará 3 puntos y el abandono 0, de acuerdo con el resultado confirmado.

Tabla propuesta: posición, username actual, puntos, partidas, victorias, empates, derrotas, kills y muertes. El orden secundario ante igualdad de puntos sigue pendiente. Es una clasificación acumulativa, no un sistema de habilidad Elo.

Gráficas iniciales propuestas:

- Global: barras de los diez jugadores con más puntos.
- Mi actividad: kills y muertes de las últimas diez partidas válidas.

Actualizar al cargar la página y al terminar una partida. Las actualizaciones en tiempo real, temporadas, filtros semanales y métricas adicionales pueden añadirse después. Paginación y búsqueda por username evitarán cargar todos los jugadores a la vez.

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

- Aplicar duración, límite de kills, desempates y pausa una vez confirmados.
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

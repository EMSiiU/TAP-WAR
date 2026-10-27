# TAP-WAR — Sprint 1: base jugable en red

Estado: planificación actualizada con EMSiiU el 27-oct-2026. Roles confirmados: P1 EMSiiU, P2 Rebobin0, P3 PatoHacker458 y P4 John-Hdz. Sprint del 27-oct al 04-nov-2026: siete días hábiles, excluyendo sábados y domingos. Revisión el 04-nov. Sin cuota fija de horas; las cifras por tarea son estimaciones iniciales, no mínimos garantizados. Microservicios no obligatorios por ahora. Reglas principales confirmadas por EMSiiU; reingreso simple autorizado. Consultar decisiones-iniciales.md.

## Objetivo y demostración

Dos integrantes en redes diferentes abren el prototipo alojado en Ubuntu, entran a la misma sala y ven sus movimientos. El servidor decide las posiciones y bloquea el cruce de límites y un obstáculo. Un sprite y un mapa de prueba ya se pueden cargar en el cliente.

Esta semana no incluye combate, cuentas reales, historial, ranking ni arte final. La identidad temporal sirve solo para el prototipo. La práctica de monedas de la raíz se conserva como ejercicio, no como servidor autoritativo.

## Responsables

| Rol | Responsabilidad | Revisor habitual |
| --- | --- | --- |
| P1 — EMSiiU | Organización del repositorio, React, entrada y salida de sala | P4 para documentación; P2 para interfaz |
| P2 — Rebobin0 | Phaser, teclado, representación del estado y carga de recursos | P3 |
| P3 — PatoHacker458 | Colyseus, simulación, validación y despliegue con P4 | P2 |
| P4 — John-Hdz | Boceto y recursos visuales; apoyo de despliegue a P3 | P2 para arte; P3 para infraestructura |

P1 facilita las reuniones esta semana. El equipo decide prioridades y alcance; P4 no desarrolla autenticación ni base de datos esta semana.

## Secuencia de siete días hábiles

| Día | Trabajo y punto de integración |
| --- | --- |
| 1 — mar 27-oct | Reunión de 45 min: confirmar capacidad, requisitos de materia y reglas. P1 prepara repo/Project. P2 y P3 acuerdan mensajes y coordenadas. P3 verifica Ubuntu; P4 dibuja mapa esquemático. |
| 2 — mié 28-oct | P1 crea entrada a sala con nombre temporal. P2 conecta escena al servidor. P3 publica posiciones oficiales. P4 entrega PNG y geometría inicial. Al final: dos clientes locales se ven. |
| 3 — jue 29-oct | Integrar movimiento autoritativo, límites y obstáculo; normalizar diagonales. Cargar sprite y mapa. P3/P4 preparan despliegue reproducible y conectividad. |
| 4 — vie 30-oct | Desplegar y probar entre dos redes. Corregir conexión, desaparición al salir y configuración. Si falla el acceso exterior, resolver antes de añadir funciones. |
| 5 — lun 02-nov | Resolver fallos de integración y conectividad; comprobar entradas inválidas, pérdida de foco y desconexión. |
| 6 — mar 03-nov | Repetir prueba completa desde una instalación documentada. Preparar evidencia y resolver defectos esenciales. |
| 7 — mié 04-nov | Demostración final. Revisión de 30 min y retrospectiva de 15 min. Registrar evidencia y pendientes para sprint 2. |

Seguimiento diario: 10 min o mensaje con resultado obtenido, siguiente tarea y bloqueo. Avisar un bloqueo al detectarlo; no esperar a la reunión. Máximo una Issue principal en progreso por persona. Revisar PR diariamente.

## Backlog listo para Issues

Los identificadores S1-xx son internos y no números reales de GitHub. Las estimaciones son horas de trabajo del responsable, sujetas al primer día. Todas las tareas son prioritarias salvo la indicada como opcional.

### S1-01 — Confirmar reglas mínimas y restricciones
Responsable: P1, con todo el equipo. Revisor: P3. Estimación: 2 h. Dependencias: ninguna.
- [ ] Confirmar horas, fecha de revisión, nombres y requisitos de microservicios.
- [ ] Acordar movimiento WASD, mapa 2D, sin salto y velocidad diagonal normalizada.
- [ ] Registrar quién decide posiciones, límites, obstáculos y salida de sala.
- [ ] Marcar cada decisión como aceptada o pendiente con responsable y fecha.
Aceptación: el equipo revisó `docs/decisiones-iniciales.md`; no hay dudas abiertas que impidan movimiento o conexión.

### S1-02 — Preparar repositorio y tablero
Responsable: P1. Revisor: P4. Estimación: 3 h. Dependencias: elección de repositorio y Project.
- [ ] Crear o elegir repo; invitar colaboradores sin compartir credenciales.
- [ ] Vincular Project y fijar repositorio predeterminado.
- [ ] Crear sprint, campos, vistas y etiquetas descritos en `docs/github-project.md`.
- [ ] Publicar estas tareas como Issues y asociarlas al Project.
- [ ] Acordar estructura futura `apps/web`, `apps/game-server`, `packages/shared`, `assets/source`.
Aceptación: los cuatro acceden, cada Issue tiene responsable y sprint, y existe un primer PR revisado. La práctica existente permanece disponible.

### S1-03 — Acordar contrato cliente-servidor
Responsables: P2 (2 h, contrato y ejemplos) y P3 (1 h, validación servidor). Revisor: P1. Estimación total: 3 h-persona. Dependencias: S1-01.
- [ ] Versionar mensajes de dirección y estado de jugadores: identificador, x, y.
- [ ] Acordar unidades, origen, velocidad, forma de colisión y ritmo de simulación.
- [ ] Cliente envía intención direccional; servidor valida formato y aplica velocidad.
- [ ] Definir nombre temporal, unión, sala llena, salida y errores.
Aceptación: ejemplos de mensajes válidos e inválidos documentados; cliente no puede imponer posición ni velocidad. Ningún componente depende de contratos verbales.

### S1-04 — Crear cliente React con escena Phaser
Responsable: P2. Revisor: P1. Estimación: 6 h. Dependencias: S1-02; integración depende de S1-03.
- [ ] Crear estructura y fijar versiones con archivo de bloqueo.
- [ ] Montar/desmontar Phaser desde la pantalla de juego sin duplicar canvas o conexiones.
- [ ] Mostrar figuras provisionales para los jugadores del estado oficial.
- [ ] Documentar comandos de instalación y ejecución.
Aceptación: otro integrante inicia el cliente siguiendo instrucciones; entrar y salir dos veces no duplica la escena.

### S1-05 — Crear sala y sincronizar jugadores
Responsables: P3 (3 h, sala y estado) y P1 (2 h, ciclo de conexión y pruebas). Revisor: P2. Estimación total: 5 h-persona. Dependencias: S1-02 y S1-03.
- [ ] Crear servidor Colyseus y sala de prueba con máximo cuatro jugadores.
- [ ] Agregar jugador al entrar y quitarlo al detectar desconexión.
- [ ] Sincronizar identificador y posiciones iniciales.
Aceptación: dos clientes muestran los mismos participantes; un quinto cliente recibe rechazo comprensible. Sin reconexión automática en este sprint: salir y volver crea una participación nueva.

### S1-06 — Integrar movimiento y colisiones autoritativas
Responsable: P2 y P3, P3 responsable de Issue. Revisión cruzada. Estimación: 4 h P3 + 6 h P2. Dependencias: S1-04 y S1-05.
- [ ] Capturar WASD y enviar dirección; detener movimiento al perder foco o dejar de recibir entradas según regla acordada.
- [ ] Simular movimiento en servidor y normalizar diagonales.
- [ ] Aplicar límites y al menos un obstáculo usando geometría compartida.
- [ ] Mostrar posiciones oficiales en ambos clientes.
Aceptación: ninguno atraviesa el obstáculo o bordes; ambos observan el movimiento; mensajes malformados y posiciones inventadas no alteran el estado oficial. No se exige predicción avanzada esta semana.

### S1-07 — Construir flujo provisional de entrada y salida
Responsable: P1. Revisor: P2. Estimación: 5 h. Dependencias: S1-03, S1-04 y S1-05.
- [ ] Introducir nombre temporal y entrar a sala de prueba.
- [ ] Mostrar conectando, conectado, sala llena y fallo de conexión.
- [ ] Salir, cerrar conexión y regresar al formulario.
Aceptación: otro integrante completa el flujo sin consola ni cambios de código. No se presenta este acceso temporal como autenticación segura.

### S1-08 — Entregar e integrar recursos gráficos de prueba
Responsable: P4. Revisor: P2. Estimación: 7 h P4 + 2 h P2. Dependencias: S1-01; integración depende de S1-04.
- [ ] Entregar personaje estático y mapa esquemático conforme a `docs/arte-semana-1.md`.
- [ ] Acordar con P2/P3 dimensiones, obstáculos y puntos de aparición.
- [ ] Cargar los archivos reales en el prototipo y comprobar escala.
Aceptación: PNG sin fondo accidental, escala legible, pies alineados y obstáculo visual coincidente con colisión. No se exige animación final.

### S1-09 — Verificar Ubuntu y acceso desde Internet
Responsables: P3 (2 h, verificación en servidor) y P4 (1 h, inventario/documentación). Revisor: P1. Estimación total: 3 h-persona. Dependencias: ninguna.
- [ ] Registrar versión Ubuntu, CPU, RAM, disco, servicios existentes y método SSH.
- [ ] Verificar IP pública, posible CGNAT, control de router y dominio si existe.
- [ ] Definir puertos, responsable de administración y mecanismo de publicación.
- [ ] Si no hay acceso entrante, documentar y elegir una alternativa viable con el dueño del servidor.
Aceptación: ruta de acceso exterior comprobada o bloqueo identificado con acción concreta; no publicar claves, contraseñas ni archivos de entorno.

### S1-10 — Desplegar y demostrar desde dos redes
Responsables: P4 (4 h, configuración y documentación), P1 (2 h, prueba/evidencias) y P3 (2 h, validación servidor). Revisor del cliente: P2. Estimación total: 8 h-persona. Dependencias: S1-06, S1-07 y S1-09.
- [ ] Preparar configuración y arranque reproducible; incluir `.env.example` sin secretos.
- [ ] Configurar URL del servidor fuera del código; conexión WebSocket compatible con HTTPS si se usa HTTPS.
- [ ] Documentar inicio, parada y consulta de registros.
- [ ] Ejecutar `docs/prueba-sprint-1.md` y registrar versión, fecha y resultados.
Aceptación: dos personas en redes distintas completan la prueba y existe evidencia sin credenciales expuestas.

### S1-11 — Cerrar sprint y ajustar semana 2
Responsable: P1, participan todos. Revisor: P4. Estimación: 1 h. Dependencias: demostración o registro explícito de impedimentos.
- [ ] Demostrar, comparar con el objetivo y registrar lo pendiente sin marcarlo como terminado.
- [ ] Elegir una mejora del proceso y actualizar estimaciones.
- [ ] Priorizar pendientes esenciales antes de combate u otras ampliaciones.
Aceptación: notas de revisión y siguiente backlog disponibles.

### S1-12 — Animación de caminar (opcional)
Responsable: P4. Revisor: P2. Estimación: 3 h. Dependencias: S1-08 integrada y trabajo esencial sin bloqueos.
Aceptación: una animación de prueba se carga y reproduce con orden, tamaño y FPS documentados. Se retira si falta tiempo.

## Definición de terminado

- Criterios de la Issue demostrados y evidencias registradas.
- PR revisado por otra persona e integrado a la rama principal.
- Instrucciones y contratos actualizados si cambió su uso.
- Sin secretos en archivos ni registros compartidos.
- Si cambia cliente/servidor, ambos se prueban juntos; si cambia arte, se verifica dentro del juego.
- La tarea de despliegue requiere prueba real en Ubuntu; el resto no necesita esperar para integrarse.

## Distribución y campos del Project

Consultar [planificación actualizada](planificacion-sprint-1.md). Esa tabla define horas-persona, tamaños, prioridades, fechas y reparto vigente.

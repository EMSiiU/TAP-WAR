# Issues de semana 1 listas para publicar

Repositorio: https://github.com/EMSiiU/TAP-WAR
Project: https://github.com/users/EMSiiU/projects/1/views/1

Estado: publicadas mediante la interfaz de GitHub como Issues #1 a #12 y añadidas al Backlog del Project. Todas sin asignar por instrucción del propietario; cada Issue tiene un comentario con responsable y revisor propuestos.

Asignación manual pendiente del propietario. P1 EMSiiU y P2 Rebobin0 son propuestas; P3 PatoHacker458 y P4 John-Hdz fueron indicados por el propietario.

## S1-01 — Confirmar reglas mínimas y restricciones

Responsable: EMSiiU, con todo el equipo. Revisor: PatoHacker458. Estimación: 2 h. Dependencias: ninguna.
- [ ] Confirmar horas, fecha de revisión, nombres y requisitos de microservicios.
- [ ] Acordar movimiento WASD, mapa 2D, sin salto y velocidad diagonal normalizada.
- [ ] Registrar quién decide posiciones, límites, obstáculos y salida de sala.
- [ ] Marcar cada decisión como aceptada o pendiente con responsable y fecha.
Aceptación: el equipo revisó `docs/decisiones-iniciales.md`; no hay dudas abiertas que impidan movimiento o conexión.

Sprint: Semana 1. Fechas por acordar.

## S1-02 — Preparar repositorio y tablero

Responsable: EMSiiU. Revisor: John-Hdz. Estimación: 3 h. Dependencias: elección de repositorio y Project.
- [ ] Crear o elegir repo; invitar colaboradores sin compartir credenciales.
- [ ] Vincular Project y fijar repositorio predeterminado.
- [ ] Crear sprint, campos, vistas y etiquetas descritos en `docs/github-project.md`.
- [ ] Publicar estas tareas como Issues y asociarlas al Project.
- [ ] Acordar estructura futura `apps/web`, `apps/game-server`, `packages/shared`, `assets/source`.
Aceptación: los cuatro acceden, cada Issue tiene responsable y sprint, y existe un primer PR revisado. La práctica existente permanece disponible.

Sprint: Semana 1. Fechas por acordar.

## S1-03 — Acordar contrato cliente-servidor

Responsable: PatoHacker458 con Rebobin0. Revisor: Rebobin0. Estimación: 3 h. Dependencias: S1-01.
- [ ] Versionar mensajes de dirección y estado de jugadores: identificador, x, y.
- [ ] Acordar unidades, origen, velocidad, forma de colisión y ritmo de simulación.
- [ ] Cliente envía intención direccional; servidor valida formato y aplica velocidad.
- [ ] Definir nombre temporal, unión, sala llena, salida y errores.
Aceptación: ejemplos de mensajes válidos e inválidos documentados; cliente no puede imponer posición ni velocidad. Ningún componente depende de contratos verbales.

Sprint: Semana 1. Fechas por acordar.

## S1-04 — Crear cliente React con escena Phaser

Responsable: Rebobin0. Revisor: EMSiiU. Estimación: 6 h. Dependencias: S1-02; integración depende de S1-03.
- [ ] Crear estructura y fijar versiones con archivo de bloqueo.
- [ ] Montar/desmontar Phaser desde la pantalla de juego sin duplicar canvas o conexiones.
- [ ] Mostrar figuras provisionales para los jugadores del estado oficial.
- [ ] Documentar comandos de instalación y ejecución.
Aceptación: otro integrante inicia el cliente siguiendo instrucciones; entrar y salir dos veces no duplica la escena.

Sprint: Semana 1. Fechas por acordar.

## S1-05 — Crear sala y sincronizar jugadores

Responsable: PatoHacker458. Revisor: Rebobin0. Estimación: 5 h. Dependencias: S1-02 y S1-03.
- [ ] Crear servidor Colyseus y sala de prueba con máximo cuatro jugadores.
- [ ] Agregar jugador al entrar y quitarlo al detectar desconexión.
- [ ] Sincronizar identificador y posiciones iniciales.
Aceptación: dos clientes muestran los mismos participantes; un quinto cliente recibe rechazo comprensible. Sin reconexión automática en este sprint: salir y volver crea una participación nueva.

Sprint: Semana 1. Fechas por acordar.

## S1-06 — Integrar movimiento y colisiones autoritativas

Responsable: Rebobin0 y PatoHacker458, PatoHacker458 responsable de Issue. Revisión cruzada. Estimación: 6 h PatoHacker458 + 4 h Rebobin0. Dependencias: S1-04 y S1-05.
- [ ] Capturar WASD y enviar dirección; detener movimiento al perder foco o dejar de recibir entradas según regla acordada.
- [ ] Simular movimiento en servidor y normalizar diagonales.
- [ ] Aplicar límites y al menos un obstáculo usando geometría compartida.
- [ ] Mostrar posiciones oficiales en ambos clientes.
Aceptación: ninguno atraviesa el obstáculo o bordes; ambos observan el movimiento; mensajes malformados y posiciones inventadas no alteran el estado oficial. No se exige predicción avanzada esta semana.

Sprint: Semana 1. Fechas por acordar.

## S1-07 — Construir flujo provisional de entrada y salida

Responsable: EMSiiU. Revisor: Rebobin0. Estimación: 5 h. Dependencias: S1-03, S1-04 y S1-05.
- [ ] Introducir nombre temporal y entrar a sala de prueba.
- [ ] Mostrar conectando, conectado, sala llena y fallo de conexión.
- [ ] Salir, cerrar conexión y regresar al formulario.
Aceptación: otro integrante completa el flujo sin consola ni cambios de código. No se presenta este acceso temporal como autenticación segura.

Sprint: Semana 1. Fechas por acordar.

## S1-08 — Entregar e integrar recursos gráficos de prueba

Responsable: John-Hdz. Revisor: Rebobin0. Estimación: 7 h John-Hdz + 2 h Rebobin0. Dependencias: S1-01; integración depende de S1-04.
- [ ] Entregar personaje estático y mapa esquemático conforme a `docs/arte-semana-1.md`.
- [ ] Acordar con Rebobin0/PatoHacker458 dimensiones, obstáculos y puntos de aparición.
- [ ] Cargar los archivos reales en el prototipo y comprobar escala.
Aceptación: PNG sin fondo accidental, escala legible, pies alineados y obstáculo visual coincidente con colisión. No se exige animación final.

Sprint: Semana 1. Fechas por acordar.

## S1-09 — Verificar Ubuntu y acceso desde Internet

Responsable: PatoHacker458 con apoyo de John-Hdz. Revisor: EMSiiU. Estimación: 3 h. Dependencias: ninguna.
- [ ] Registrar versión Ubuntu, CPU, RAM, disco, servicios existentes y método SSH.
- [ ] Verificar IP pública, posible CGNAT, control de router y dominio si existe.
- [ ] Definir puertos, responsable de administración y mecanismo de publicación.
- [ ] Si no hay acceso entrante, documentar y elegir una alternativa viable con el dueño del servidor.
Aceptación: ruta de acceso exterior comprobada o bloqueo identificado con acción concreta; no publicar claves, contraseñas ni archivos de entorno.

Sprint: Semana 1. Fechas por acordar.

## S1-10 — Desplegar y demostrar desde dos redes

Responsable: PatoHacker458 con John-Hdz. Revisor: EMSiiU. Estimación: 4 h PatoHacker458 + 4 h John-Hdz. Dependencias: S1-06, S1-07 y S1-09.
- [ ] Preparar configuración y arranque reproducible; incluir `.env.example` sin secretos.
- [ ] Configurar URL del servidor fuera del código; conexión WebSocket compatible con HTTPS si se usa HTTPS.
- [ ] Documentar inicio, parada y consulta de registros.
- [ ] Ejecutar `docs/prueba-sprint-1.md` y registrar versión, fecha y resultados.
Aceptación: dos personas en redes distintas completan la prueba y existe evidencia sin credenciales expuestas.

Sprint: Semana 1. Fechas por acordar.

## S1-11 — Cerrar sprint y ajustar semana 2

Responsable: EMSiiU, participan todos. Revisor: John-Hdz. Estimación: 1 h. Dependencias: demostración o registro explícito de impedimentos.
- [ ] Demostrar, comparar con el objetivo y registrar lo pendiente sin marcarlo como terminado.
- [ ] Elegir una mejora del proceso y actualizar estimaciones.
- [ ] Priorizar pendientes esenciales antes de combate u otras ampliaciones.
Aceptación: notas de revisión y siguiente backlog disponibles.

Sprint: Semana 1. Fechas por acordar.

## S1-12 — Animación de caminar (opcional)

Responsable: John-Hdz. Revisor: Rebobin0. Estimación: 3 h. Dependencias: S1-08 integrada y trabajo esencial sin bloqueos.
Aceptación: una animación de prueba se carga y reproduce con orden, tamaño y FPS documentados. Se retira si falta tiempo.

Sprint: Semana 1. Fechas por acordar.

## Enlaces publicados

- S1-01: https://github.com/EMSiiU/TAP-WAR/issues/1
- S1-02: https://github.com/EMSiiU/TAP-WAR/issues/2
- S1-03: https://github.com/EMSiiU/TAP-WAR/issues/3
- S1-04: https://github.com/EMSiiU/TAP-WAR/issues/4
- S1-05: https://github.com/EMSiiU/TAP-WAR/issues/5
- S1-06: https://github.com/EMSiiU/TAP-WAR/issues/6
- S1-07: https://github.com/EMSiiU/TAP-WAR/issues/7
- S1-08: https://github.com/EMSiiU/TAP-WAR/issues/8
- S1-09: https://github.com/EMSiiU/TAP-WAR/issues/9
- S1-10: https://github.com/EMSiiU/TAP-WAR/issues/10
- S1-11: https://github.com/EMSiiU/TAP-WAR/issues/11
- S1-12: https://github.com/EMSiiU/TAP-WAR/issues/12

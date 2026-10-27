# TAP-WAR — Reglas mínimas y restricciones (S1-01)

Preparado el 27 de octubre de 2026. Estado: reglas principales confirmadas por EMSiiU; pendiente revisión técnica del equipo. Coordinación: EMSiiU. Revisor previsto: PatoHacker458.

## Contexto confirmado

- Repositorio público: https://github.com/EMSiiU/TAP-WAR
- Project: https://github.com/users/EMSiiU/projects/1/views/1
- Equipo: EMSiiU, Rebobin0, PatoHacker458 y John-Hdz.
- P3: PatoHacker458, servidor de juego e infraestructura. P4: John-Hdz, arte y apoyo de plataforma.
- Roles confirmados por EMSiiU el 27-oct-2026: P1 EMSiiU, P2 Rebobin0, P3 PatoHacker458 y P4 John-Hdz.
- Sprint: 27-oct a 04-nov-2026, siete días de lunes a viernes; revisión el 04-nov.
- Según EMSiiU, la materia no exige microservicios por ahora. No se impone separación en servicios independientes.
- Sin cuota fija de horas: se usarán estimaciones por tarea, ajustables al aprender e integrar.
- Ubuntu Server de PatoHacker458 es el destino previsto; capacidad y conectividad se verifican en S1-09.

## Propuestas para aceptar

Todas las propuestas siguientes requieren revisión del equipo el día 1. Registrar fecha y participantes al aceptarlas.

| Tema | Propuesta | Estado |
| --- | --- | --- |
| Alcance sprint 1 | Dos clientes en redes distintas, movimiento y un obstáculo | Por aceptar |
| Vista | 2D cenital, sin salto ni altura jugable | Confirmado |
| Entradas | WASD; diagonal normalizada | Por aceptar |
| Autoridad | Servidor decide posiciones y colisiones | Confirmado  |
| Colisión entre jugadores | No se bloquean entre sí en sprint 1 | Confirmado |
| Acceso | Nombre temporal y sala de prueba de hasta 4 jugadores | Límite de 4 confirmado; nombre temporal propuesto |
| Desconexión | Retirar jugador al detectar cierre; volver implica nueva entrada | Elegido por simplicidad con autorización de EMSiiU |
| Tecnologías | React + TypeScript, Phaser, Colyseus; versiones fijadas al crear estructura | Por aceptar |
| Arte | PNG de prueba; geometría separada y compartida con servidor | Por aceptar |
| Repositorio | Un repositorio, varios componentes | Por aceptar |

## Reglas operativas propuestas

Estas reglas complementan la tabla; aún necesitan aceptación del equipo.

| ID | Regla | Implementación |
| --- | --- | --- |
| R01 | WASD mueve en ocho direcciones; soltar teclas detiene. La diagonal tiene la misma rapidez que el movimiento horizontal o vertical. | P2/P3 |
| R02 | Cliente envía intención, no posiciones que el servidor deba aceptar. Servidor aplica velocidad, límites y colisiones. | P3, integración P2 |
| R03 | El cuerpo completo permanece dentro del mapa y no atraviesa obstáculos. Jugadores no se bloquean entre sí en este sprint. | P3 |
| R04 | Cliente y servidor usan la misma geometría versionada. Una imagen del mapa no define colisiones. | P2/P3, revisión P4 |
| R05 | Sala de prueba de hasta cuatro; el quinto recibe rechazo comprensible. No hay listado público en este sprint. | P3/P1 |
| R06 | Nombre temporal e identificador generado por servidor; el nombre no acredita identidad. Sin login real en este sprint. | P1/P3 |
| R07 | Salir cierra conexión y regresa al formulario. El servidor retira al participante cuando detecta desconexión. | P1/P3 |
| R08 | Reingresar crea un participante nuevo; no recupera posición ni identidad temporal anterior. | P3 |
| R09 | Perder foco detiene la intención del cliente. Servidor caduca entradas para evitar movimiento atascado; plazo por definir en S1-03. | P2/P3 |
| R10 | Mensajes inválidos no cambian arbitrariamente el estado ni derriban la sala. | P3 |
| R11 | Puntos de aparición dentro del mapa y fuera de obstáculos, acordados antes de integrar arte. | P3/P4 |

No se incluyen esta semana combate, vida, muertes, condiciones de victoria, persistencia, ranking, arte final ni recuperación de personaje tras desconexión. Se diseñarán antes de las tareas que los necesiten.

## Datos pendientes

- Aceptación o cambios explícitos a las reglas propuestas.
- Otros requisitos de la rúbrica, si existen; microservicios no obligatorios según EMSiiU.
- Viabilidad del esfuerzo estimado al repartir tareas, sin cuota fija de horas.
- Especificaciones Ubuntu, accesibilidad exterior y responsable de despliegue.
- Velocidad, coordenadas, tamaño del cuerpo, frecuencia de simulación y formato de mensajes: P2/P3 antes de S1-06.

Toda nueva duda debe llevar responsable y momento de decisión; no tratar una propuesta como requisito confirmado.

## Responsables y plazos para cerrar dudas

| Tema | Quién obtiene la respuesta | Momento límite |
| --- | --- | --- |
| Fechas y horas por integrante | EMSiiU con todo el equipo | Planificación inicial, antes de comprometer trabajo |
| Requisitos obligatorios de la materia y fuente (rúbrica/docente) | EMSiiU | Antes de cerrar arquitectura |
| Aceptación o cambios a reglas y alcance | Todo el equipo; coordina EMSiiU | Antes de S1-03 |
| Velocidad, unidades, origen, cuerpo de colisión, ritmos de simulación/red, caducidad y formato de mensajes | PatoHacker458 y Rebobin0 | S1-03, antes de S1-05/S1-06 |
| Dimensiones y recursos de arte | John-Hdz con Rebobin0/PatoHacker458 | S1-08, antes de integrar mapa |
| Recursos y conectividad Ubuntu | PatoHacker458 | S1-09, antes de S1-10 |

## Agenda de decisión (30–45 minutos)

1. Confirmar disponibilidad, fechas, roles y requisitos de materia (10 min).
2. Leer reglas y alcance; registrar cambios concretos (15 min).
3. Revisar dependencias y compromisos de cada integrante (10 min).
4. Registrar acuerdos y desacuerdos con siguiente acción (5 min).

## Acta por completar con respuestas reales

- Fecha de reunión y participantes: pendiente.
- Inicio: 27-oct-2026. Revisión: 04-nov-2026. Siete días hábiles, excluyendo sábado y domingo; no se excluyen otros días por instrucción del propietario.
- Horas: sin compromiso semanal fijo. Estimación base por tareas: EMSiiU 15 h; Rebobin0 16 h; PatoHacker458 12 h; John-Hdz 12 h (+3 h opcionales). No incluye toda la participación en reuniones, revisiones y contingencias; no son mínimos garantizados.
- Roles P1/P2: EMSiiU=P1 y Rebobin0=P2, confirmados por EMSiiU el 27-oct-2026.
- Microservicios: no exigidos por ahora, informado por EMSiiU el 27-oct-2026. Otros requisitos no informados.
- EMSiiU confirma: 2D, sin salto, sin bloqueo entre jugadores, máximo cuatro y servidor autoritativo. Autoriza elegir reingreso simple: nueva participación en punto válido sin recuperar posición anterior. WASD continúa como control inicial propuesto, no confirmado expresamente en la última respuesta.
- Dudas que bloquean trabajo, responsable y plazo: pendiente.
- Revisión de PatoHacker458: pendiente.

## Criterio para cerrar S1-01

- [ ] Fechas, capacidad, roles y requisitos registrados.
- [ ] Reglas aceptadas o modificadas explícitamente, con fecha y participantes.
- [ ] Pendientes técnicos con responsable y tarea de destino.
- [ ] Revisor comprueba que no hay ambigüedades que impidan S1-03.
- [ ] Documento compartido y vinculado en https://github.com/EMSiiU/TAP-WAR/issues/1

Mover a In review cuando el documento tenga respuestas reales. Cerrar después de revisión; preparar el borrador no equivale a aceptar las reglas.

## Aclaración de reingreso

Desconectarse termina la participación temporal al detectar la pérdida de conexión. Volver a entrar genera un participante nuevo y una aparición válida; no restaura la posición anterior. Este sprint no tiene cuentas ni progreso persistente que recuperar. Los plazos de detección se fijan en S1-03.

## Reparto actualizado

Consultar `planificacion-sprint-1.md`: el Project fue revisado y se comparte el trabajo técnico para reducir la carga de PatoHacker458 sin retirar su responsabilidad sobre el servidor.

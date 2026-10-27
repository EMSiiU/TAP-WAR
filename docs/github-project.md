# Configuración de GitHub para TAP-WAR

## Repositorio y Project

Usar inicialmente un repositorio para código, recursos y documentación. Nombre propuesto: TAP-WAR; propietario y visibilidad pendientes de decisión del usuario. Un único repositorio puede contener varios servicios.

1. Crear/elegir el repositorio con el mismo propietario que el Project cuando sea posible.
2. En el repositorio, abrir Projects y seleccionar Link a project; elegir el Project existente.
3. En Settings del Project, configurar el repositorio predeterminado para nuevas Issues. Vincular un repositorio no importa todas sus Issues automáticamente.
4. Dar acceso al repositorio y al Project a cada integrante: son permisos distintos. Los colaboradores que necesiten código deben tener acceso de escritura al repo.
5. Crear las Issues de `semana-1.md`, añadirlas al Project y reemplazar P1–P4 por usuarios reales.

Referencia: https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/adding-your-project-to-a-repository

## Campos y vistas

- Status: Backlog, Ready, In progress, In review, Done.
- Iteration: Sprint, duración una semana; confirmar fecha de inicio antes de configurar cinco iteraciones.
- Assignees: responsable real; revisor indicado en la descripción.
- Priority: P0 esencial para objetivo, P1 apoyo, P2 opcional.
- Estimate: horas estimadas, sin confundirlas con fechas comprometidas.
- Etiquetas de repo: planning, web, gameplay, multiplayer, art, infra, bug.
- Milestone opcional: Semana 1 — prototipo en red. No sustituye al campo Sprint.

Vistas: tablero Semana 1 filtrado por Sprint; tabla Backlog con prioridad, responsable y estimación; tabla Bloqueos usando etiqueta `blocked`.

Workflows: activar Done al cerrar Issue. Si configuran auto-add, limitarlo al repositorio elegido y comprobar con una Issue de prueba. El movimiento a In review se hace manualmente al abrir PR. Referencia: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations

## Flujo de trabajo

1. Tomar Issue Ready con criterios definidos.
2. Crear rama corta, por ejemplo `feat/sala-prueba` o `docs/reglas-iniciales`.
3. Abrir PR pequeño; enlazar Issue con `Closes #numero` solo si la resuelve completamente.
4. Pedir revisión a otra persona y describir cómo verificarlo.
5. Integrar y cerrar tras comprobar los criterios.

Acordar no subir directamente cambios de producto a main. Configurar revisión obligatoria si el plan y la visibilidad del repositorio lo permiten. No añadir automatizaciones de despliegue con secretos antes de definir el acceso al servidor.

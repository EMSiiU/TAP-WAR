# TAP-WAR

Videojuego multijugador para navegador desarrollado para Tópicos Avanzados de Desarrollo Web. React gestiona la interfaz, Phaser representa la arena y Colyseus mantiene el estado autoritativo de la partida.

- [Repositorio](https://github.com/EMSiiU/TAP-WAR)
- [Project](https://github.com/users/EMSiiU/projects/1)

## Estado del proyecto

- Salas públicas (listadas en `/api/rooms`) o privadas por código de 6 caracteres, con capacidades de **4, 10 o 20 jugadores** y mapas dinámicos (**Pequeño** `1024×768`, **Mediano** `1600×1152`, **Grande** `2240×1600`) con cámara seguidora y minimapa.
- Controles adaptables: PC (WASD + ratón/ESPACIO), dispositivos móviles/tablets (joysticks táctiles gemelos + botón de pantalla completa) y mandos por cable o Bluetooth (Gamepad API).
- Cuatro personajes, diez armas, dos estilos de mira, munición, pickups, reaparición, menú personal, resultados persistentes, rankings y revancha.
- Acceso con correo/contraseña o Google mediante Supabase. GitHub está preparado como opción de configuración, pendiente de habilitación y prueba.
- Username obligatorio antes del lobby, editable desde Mi perfil; de 3 a 20 caracteres ASCII, números o guion bajo, único sin distinguir mayúsculas.
- Foto de perfil opcional: subida, reemplazo y eliminación con Supabase Storage privado. No sustituye al personaje de la arena.
- Preferencias de personaje, arma y mira guardadas por cuenta. Colyseus verifica el token y obtiene el username del perfil.

El despliegue en Ubuntu (Docker + Tailscale Funnel) y el respaldo en Render están listos; SMTP, recuperación de contraseña y reconexión de 30 s quedan pendientes. El [estado de validación](docs/estado-actual.md) distingue implementación, pruebas realizadas y casos por verificar.

El [plan de próximos pasos](docs/proximos-pasos.md) detalla las decisiones del proyecto y los pendientes restantes.

## Organización del repositorio

```text
apps/web/             Cliente React, TypeScript y Phaser
apps/game-server/     Servidor Colyseus y validación de cuentas
packages/shared/      Geometría de arena y catálogo de armas
supabase/migrations/  Esquema, permisos, perfiles y Storage
supabase/tests/       Inspecciones y pruebas SQL manuales
docs/                 Contrato, configuración, estado y planificación
docs/art-sources/     Editables y licencia del arte
prueba-phaser/        Práctica independiente de aprendizaje
```

## Tecnologías y versiones

| Componente | Tecnología |
| --- | --- |
| Interfaz | React 19, TypeScript 6.0 y Vite 8 |
| Juego 2D | Phaser 3.90.0 |
| Servidor | Colyseus 0.17.11 y @colyseus/schema 4.0.31 |
| Conexión del navegador | @colyseus/sdk 0.17.43 |
| Cuentas y almacenamiento | Supabase Auth, Postgres y Storage; supabase-js 2.119.2 |
| Entorno de desarrollo | Node.js 24 y npm |

Los archivos package-lock.json de cada aplicación fijan las versiones instaladas por `npm ci`.

## Empezar

Ejecuta los comandos desde la raíz del repositorio. Cada aplicación tiene su propio package.json; la raíz no tiene un comando `npm run dev`.

Preparar los archivos de configuración una sola vez, si aún no existen:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/game-server/.env.example apps/game-server/.env
```

Completa Project URL y Publishable key en ambos archivos. Configura también el servidor de juego en VITE_GAME_SERVER_URL. Los archivos reales de entorno se ignoran en Git; los ejemplos no contienen credenciales.

Sigue la [configuración de Supabase](docs/autenticacion-supabase.md) para preparar un proyecto nuevo y aplicar las migraciones en orden. No vuelvas a ejecutar migraciones ya aplicadas.

En una terminal:

```powershell
npm --prefix apps/game-server ci
npm --prefix apps/game-server run dev
```

En otra:

```powershell
npm --prefix apps/web ci
npm --prefix apps/web run dev
```

Abre [http://localhost:5174](http://localhost:5174). Vite usa strictPort: si 5174 está ocupado, detén la otra instancia en lugar de cambiar de origen. Colyseus escucha en 127.0.0.1:2567 y su ruta /health devuelve `{"ok":true}`. Para probar dos cuentas, utiliza contextos de navegador independientes.

## Verificar el cambio

```powershell
npm --prefix apps/web test
npm --prefix apps/web run build
npm --prefix apps/game-server test
node apps/web/node_modules/typescript/bin/tsc -p apps/game-server
```

Consulta el [manual técnico](DOCUMENTACION.md), la [guía de despliegue](docs/despliegue.md) y el [contrato cliente-servidor](docs/contrato-cliente-servidor.md). La [planificación del sprint 1](docs/planificacion-sprint-1.md) y sus [pruebas](docs/prueba-sprint-1.md) conservan el historial del primer prototipo, no el alcance completo actual. La práctica Phaser tiene su propio [README](prueba-phaser/README.md).

## Equipo

| Integrante | Responsabilidad principal |
| --- | --- |
| EMSiiU | Organización, experiencia web y apoyo de integración |
| Rebobin0 | Cliente Phaser, contratos e integración de movimiento |
| PatoHacker458 | Servidor de juego, simulación e infraestructura Ubuntu |
| John-Hdz | Personajes, mapa, recursos visuales y apoyo al despliegue |

Las tareas compartidas tienen el reparto de horas documentado en cada Issue y en la planificación del sprint.

## Forma de trabajo

Las mismas Issues avanzan por **Backlog → Ready → In progress → In review → Done**. Cada cambio se desarrolla en una rama y se revisa mediante pull request antes de integrarse. Una tarea termina cuando cumple sus criterios de aceptación y fue revisada.

- [Configuración y flujo de GitHub](docs/github-project.md)
- [Formatos y entrega de arte](docs/arte-semana-1.md)
- [Prueba de aceptación del primer sprint](docs/prueba-sprint-1.md)

Guardar configuración privada fuera del repositorio. Cuando sea necesaria, documentar sus variables con ejemplos sin credenciales.

## Rankings y estadísticas

Ranking global con fotos, tabla y gráfica; estadísticas propias e historial para usuarios autenticados. Requiere aplicar las migraciones [`20261123000100_match_rankings.sql`](supabase/migrations/20261123000100_match_rankings.sql) y [`20261123000200_expand_match_capacity.sql`](supabase/migrations/20261123000200_expand_match_capacity.sql) y configurar `SUPABASE_SECRET_KEY` solo en el servidor. Ver [activación y pruebas](docs/rankings.md).

## Escenarios

Cantera del desierto y Planta industrial, ambos para 4/10/20 jugadores. La creación de sala permite elegir escenario y capacidad por separado. Arte y colisiones comparten un catálogo; ver [mapas y pruebas](docs/mapas.md).

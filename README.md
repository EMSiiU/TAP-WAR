# TAP-WAR

Videojuego multijugador para navegador desarrollado como proyecto de Tópicos Avanzados de Desarrollo Web. La propuesta es competir con personajes en una arena 2D, con movimiento y combate coordinados por un servidor autoritativo. (Estilo LOL)

## Estado del proyecto

En planificación y preparación del primer prototipo en red. La carpeta `prueba-phaser/` contiene un ejercicio local de aprendizaje; todavía no implementa el juego multijugador de TAP-WAR.

- [Repositorio](https://github.com/EMSiiU/TAP-WAR)
- [Tablero de trabajo](https://github.com/users/EMSiiU/projects/1)
- Sprint 1: del 27 de octubre al 4 de noviembre de 2026, siete días de lunes a viernes.

## Objetivo del primer sprint

Dos personas desde redes distintas entran a una misma sala alojada en Ubuntu y ven sus movimientos. El servidor valida posiciones, límites y obstáculos. Se integran un personaje y un mapa de prueba.

Reglas principales: vista 2D, sin salto, sin bloqueo entre jugadores y salas de hasta cuatro participantes. Volver tras una desconexión crea una participación nueva, sin recuperar la posición anterior. Combate, cuentas y resultados persistentes se incorporarán en etapas posteriores.

## Organización del repositorio

```text
TAP-WAR/
├── .github/          # Plantillas de Issues y pull requests
├── docs/             # Reglas, planificación y criterios de aceptación
├── prueba-phaser/    # Ejercicio independiente de aprendizaje
│   ├── README.md
│   ├── index.html
│   └── juego.js
└── README.md
```

Cuando se implemente el prototipo, la estructura prevista es:

```text
apps/web/            # Interfaz React y juego Phaser
apps/game-server/    # Servidor multijugador Colyseus
packages/shared/     # Contratos y definiciones compartidas
assets/source/       # Archivos editables del arte
```

Estas carpetas de aplicación todavía no están creadas. Se mantendrá un único repositorio para facilitar cambios coordinados entre cliente, servidor, arte y documentación. Si se incorporan microservicios, podrán tener sus propias carpetas y despliegues dentro de este repositorio.

## Tecnologías previstas

| Componente | Tecnología | Estado |
| --- | --- | --- |
| Interfaz web | React + TypeScript | Propuesta para el prototipo |
| Juego 2D | Phaser | Práctica local disponible |
| Servidor multijugador | Colyseus + TypeScript | Previsto para el sprint 1 |
| Alojamiento | Ubuntu Server de un integrante | Conectividad y recursos por verificar |

La materia no exige microservicios por ahora. La persistencia y sus herramientas se definirán cuando se aborden cuentas y resultados. Las versiones de las aplicaciones se fijarán al crear su estructura.

## Empezar

1. Leer las [reglas y decisiones iniciales](docs/decisiones-iniciales.md).
2. Consultar el [plan del sprint](docs/semana-1.md) y la [distribución vigente con estimaciones y fechas](docs/planificacion-sprint-1.md).
3. Revisar las dependencias y aceptación de la Issue en el Project antes de implementarla.
4. Para aprender Phaser, seguir el [README de la práctica](prueba-phaser/README.md). Sus comandos arrancan únicamente el ejercicio local.

No hay todavía un comando de arranque del producto completo; se documentará cuando existan cliente y servidor.

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

# S1-03 — Contrato cliente-servidor

Estado: borrador para revisión. Alcance: movimiento y apuntado de hasta cuatro jugadores en una arena 2D. Sin ataques, habilidades ni marcador en este sprint.

## Cliente → servidor

Mensaje de entrada, ejemplo: {"moveX":1,"moveY":-1,"aimAngle":0}.

- WASD: cada eje acepta únicamente -1, 0 o 1. Derecha y abajo son positivos. Teclas opuestas se cancelan.
- El cliente convierte el cursor a coordenadas del mundo y calcula el ángulo desde el centro del personaje. Puede apuntar estando quieto. Si cursor y centro coinciden, conserva el ángulo anterior.
- El ángulo se expresa en radianes en [-π, π): 0 a la derecha, π/2 hacia abajo. Se exige un número finito.
- Enviar el estado de entrada a intervalos acordados mientras se juega. Al soltar teclas, perder foco u ocultar la pestaña, limpiar las teclas activas y enviar ejes en cero si la conexión sigue abierta. El servidor detiene el movimiento si no recibe entradas válidas dentro del plazo acordado; conserva la última orientación.
- Rechazar el mensaje completo si falta un campo requerido o hay valores inválidos. Ejemplos inválidos: {"moveX":2,"moveY":0,"aimAngle":0} y {"moveX":0,"moveY":0,"aimAngle":"0"}. La posición y la velocidad no forman parte del mensaje.

## Servidor → cliente

Estado de ejemplo: {"id":"p1","x":240,"y":160,"aimAngle":0}.

- El servidor decide posición, velocidad y colisiones, normaliza el movimiento diagonal y publica la orientación recibida tras validarla. Apuntar no modifica la dirección de movimiento.
- Al entrar se recibe el estado inicial de la sala. Después se sincronizan posiciones, orientación, entradas y salidas de participantes. Al reingresar tras desconexión, se crea un ID nuevo y se usa un punto de aparición válido.

### Implementación local de S1-05

- El servidor crea la sala de prueba al arrancar. Todos los clientes web entran por ID a la misma sala, que conserva cuatro plazas y permanece disponible cuando queda vacía.
- El ID del jugador es el identificador de sesión asignado por Colyseus. El servidor asigna un punto de aparición libre y publica el estado inicial con un ángulo de 0 radianes.
- Al salir o cerrar la pestaña se elimina al jugador tras detectar la desconexión. Volver a entrar crea una nueva sesión. El movimiento, el apuntado en tiempo real y las colisiones se incorporan en S1-06.

## Datos compartidos

Origen arriba a la izquierda; x crece hacia la derecha e y hacia abajo. La posición representa el centro del cuerpo de colisión. Compartir dimensiones del mundo, geometría de obstáculos y puntos de aparición mediante un archivo de datos. Los jugadores no se bloquean entre sí.

## Configuración provisional para la primera prueba

| Parámetro | Valor |
| --- | --- |
| Arena | 1024 × 768 unidades |
| Velocidad | 220 unidades/s, también en diagonal tras normalizar |
| Cuerpo de colisión | Círculo de radio 14 unidades, independiente del sprite |
| Simulación del servidor | 30 Hz (~33 ms por paso) |
| Envío de entradas | 20 Hz (cada 50 ms), incluso sin cambios |
| Publicación de estado | 20 Hz (~50 ms), independiente de la simulación |
| Plazo sin entradas válidas | 300 ms desde la última entrada válida |

Al soltar WASD o perder el foco, enviar movimiento cero de inmediato si la conexión lo permite. Si pasan 300 ms sin entradas válidas, el servidor detiene el movimiento en el siguiente paso de simulación y conserva el último ángulo válido. Un mensaje inválido no reinicia el plazo.

## Aceptación

Revisar los ejemplos y las reglas del contrato. En la implementación posterior, comprobar con dos clientes: misma rapidez en diagonal y en línea recta, orientación visible al apuntar sin moverse, colisión resuelta por el servidor, rechazo de entradas inválidas y detención al perder el foco o vencer el plazo.

Para la fase de combate quedan como propuestas: clic izquierdo para ataque básico, derecho para secundario, Espacio para definitiva, Q/E para habilidades y Tab para el marcador.

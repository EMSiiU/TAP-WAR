# Prueba de aceptación del sprint 1

Completar con hechos; esta plantilla no indica pruebas ya ejecutadas.

Versión/commit: pendiente. Fecha: pendiente. URL: pendiente. Participantes y redes: pendiente. Navegadores: pendiente.

| Paso | Resultado esperado | Resultado real / evidencia |
| --- | --- | --- |
| Iniciar según documentación en Ubuntu | Web y servidor arrancan sin editar código | Pendiente |
| A y B abren desde redes diferentes | Ambos cargan cliente y conectan | Pendiente |
| Entrar en la misma sala | Ambos ven dos jugadores | Pendiente |
| A y B se mueven y se detienen | Ambos ven posiciones coherentes y la detención | Pendiente |
| Moverse diagonalmente | Mantiene 220 unidades/s en espacio libre, igual que al moverse recto | Pendiente |
| Apuntar con el cursor sin moverse | Ambos clientes ven cambiar la orientación sin cambiar la posición | Pendiente |
| Intentar cruzar bordes y obstáculo | Servidor impide el cruce | Pendiente |
| Cambiar foco de ventana | Movimiento no queda atascado | Pendiente |
| Enviar mensaje inválido/posición inventada mediante prueba controlada | Servidor lo rechaza sin fallar ni cambiar posición arbitrariamente | Pendiente |
| Cerrar B | A deja de ver a B tras detección de desconexión | Pendiente |
| B vuelve a entrar | Se crea nueva participación sin duplicados | Pendiente |
| Repetir entrada/salida dos veces | Sin canvas, conexiones o jugadores duplicados | Pendiente |
| Completar 4 clientes e intentar un quinto | Se respeta el máximo y se informa rechazo | Pendiente |
| Revisar sprite y mapa | Escala legible y colisión alineada | Pendiente |

Adjuntar captura o video breve y registros relevantes sin credenciales. Anotar defectos como Issues con pasos de reproducción. No cerrar el sprint como objetivo logrado si falla la prueba entre redes distintas.

### Parámetros de la primera prueba

Usar la [configuración provisional del contrato](contrato-cliente-servidor.md): arena de 1024 × 768, radio 14, simulación a 30 Hz, entradas y actualizaciones a 20 Hz. Con la conexión abierta, dejar de enviar entradas válidas mientras el personaje se mueve: el servidor debe detenerlo al cumplirse 300 ms, en el siguiente paso de simulación. Enviar entradas inválidas durante esa pausa no debe prolongar el movimiento. Comprobar que se conserva la última orientación válida.

## Prueba local de S1-05

Usa Node.js 24 con npm. Esta prueba usa Colyseus 0.17 en el servidor y
en el cliente web. Consulta las [versiones del proyecto](../README.md#tecnologías-y-versiones).

Usa dos terminales desde la raíz del repositorio. En la primera inicia Colyseus:

```powershell
Set-Location apps/game-server
npm ci
npm run dev
```

En la segunda inicia el cliente:

```powershell
Set-Location apps/web
npm ci
npm run dev
```

Comprueba que `http://127.0.0.1:2567/health` devuelve `{"ok":true}` y abre la URL que indique Vite. Usa esa misma URL en todas las pestañas.

1. En A y B pulsa **Entrar a la arena**. Cada pestaña debe mostrar un solo canvas, dos figuras en las mismas posiciones y las mismas etiquetas de ID.
2. Cierra B. A debe mostrar un solo jugador. Abre otra pestaña y vuelve a entrar. A debe mostrar dos jugadores y la segunda figura debe tener un ID nuevo.
3. Pulsa **Salir de la arena** y vuelve a entrar dos veces. El canvas debe desaparecer al salir y aparecer una sola vez al entrar. El contador de A debe reflejar cada salida y entrada.
4. Llena la sala con cuatro pestañas. En una quinta pulsa **Entrar a la arena**. Debe mostrar **La sala está llena.** y las otras cuatro deben seguir conectadas.

Resultado local del 9 de noviembre de 2026 en Chrome. Dos pestañas mostraron las mismas etiquetas y coordenadas. Cerrar una eliminó su figura y volver a entrar generó un ID nuevo. La salida por botón retiró el canvas y la reentrada creó uno solo. Con cuatro pestañas conectadas, la quinta mostró **La sala está llena.**

## Prueba local de S1-06

Inicia el servidor y el cliente con los mismos comandos de S1-05. Entra a la sala en dos pestañas.

1. En A, mueve el cursor con el cuerpo quieto y luego usa WASD. B debe ver el mismo ángulo y la misma posición. Las teclas opuestas deben cancelar el movimiento de su eje.
2. Camina contra los bordes y el rectángulo central. El círculo debe quedar dentro de la arena y detenerse frente al obstáculo. Mantén una dirección diagonal contra una cara para comprobar el deslizamiento.
3. Mantén una tecla en A y cambia a B. A debe detenerse y seguir quieto al volver hasta que pulses una tecla de nuevo. Sal de la sala y vuelve a entrar para comprobar que los controles y el canvas funcionan una sola vez.
4. Con dos clientes del SDK, envía entradas a 20 Hz durante el mismo tiempo en línea recta y en diagonal por espacio libre. Compara la distancia recorrida y verifica una velocidad cercana a 220 unidades/s en ambos recorridos.
5. Deja de enviar entradas válidas mientras el jugador se mueve y envía entradas con un eje fuera de rango. Verifica que se detiene, que se conserva el último ángulo válido y que las coordenadas añadidas a un mensaje no cambian la posición oficial.

Resultado local del 11 de noviembre de 2026. En dos pestañas de Chrome se verificaron WASD, teclas opuestas, apuntado en reposo, detención al perder foco y salida y reentrada sin duplicar el canvas. Dos clientes del SDK observaron el mismo estado al chocar con el obstáculo y el borde. Se midieron 215 unidades/s en línea recta y 224 en diagonal en recorridos de 850 ms. Las entradas inválidas no prolongaron el movimiento y las coordenadas añadidas no cambiaron la posición.

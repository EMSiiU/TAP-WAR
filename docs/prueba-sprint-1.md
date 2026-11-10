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

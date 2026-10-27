# Práctica local: primer juego con Phaser

Objetivo: entender cómo una escena crea objetos, recibe entradas del teclado y detecta contactos. Tiempo estimado: 20–30 minutos. Se usa JavaScript, Phaser 3.90.0 y un servidor sencillo de Python, sin compilación ni npm.

Phaser ejecuta el juego en el navegador. Ubuntu en WSL ejecuta únicamente el servidor que entrega los archivos.

## Ejecutar en Ubuntu (WSL)

Abre la terminal de Ubuntu. Comprueba Python:

```bash
python3 --version
```

Si no está instalado:

```bash
sudo apt update
sudo apt install python3
```

Entra a esta carpeta desde Ubuntu y levanta el servidor:

```bash
cd /mnt/c/Users/emizu/Documents/ChatGPT/TAP-WAR/prueba-phaser
python3 -m http.server 8000 --bind 0.0.0.0
```

Abre http://localhost:8000 en el navegador de Windows. Mantén la terminal abierta; para detener el servidor, pulsa `Ctrl+C`. El servidor escucha en todas las interfaces para facilitar el acceso desde Windows; úsalo en una red de confianza.

Necesitas conexión a internet para descargar Phaser desde el CDN al abrir la página. Si aparece una página sin juego, revisa la consola del navegador (F12) y que el CDN no esté bloqueado. Si el puerto está ocupado, cambia `8000` por `8001` en el comando y en la dirección.

## Probar

1. Haz clic en el juego y usa WASD: el cuadrado azul debe moverse y detenerse en los bordes.
2. Toca las cinco monedas amarillas: desaparecen y el contador aumenta una vez por moneda.
3. Al recoger todas, aparece “¡Ganaste!”.
4. Pulsa `R`: vuelven las monedas y el contador regresa a cero.

## Entender el código

| Parte | Función |
| --- | --- |
| `index.html` | Carga Phaser y después nuestro código. |
| `new Phaser.Game(...)` | Configura el lienzo, la física y la escena inicial. |
| `create()` | Crea el jugador, las monedas, el marcador y los eventos. |
| `update()` | Actualiza la velocidad según las teclas en cada fotograma. |
| `physics.add.existing(...)` | Agrega un cuerpo físico al cuadrado. |
| `physics.add.overlap(...)` | Detecta el contacto para recoger monedas. |
| `scene.restart()` | Vuelve a crear la escena para repetir la partida. |

En un juego con imágenes y sonidos, se agrega `preload()` para cargarlos antes de `create()`. Aquí usamos figuras geométricas para concentrarnos en lo esencial.

## Ejercicios breves

1. Cambia la velocidad de `350` a `220`, guarda y recarga el navegador.
2. Cambia el color o el tamaño del jugador.
3. Cambia las posiciones de las cinco monedas.
4. Observa los cuerpos físicos con `debug: true` (ya activado); cambia a `false` para ocultarlos.

La práctica termina cuando pueden explicar qué sucede en `create()`, qué se repite en `update()` y cómo `overlap` modifica el marcador.

Referencia: [tutorial oficial del primer juego de Phaser](https://docs.phaser.io/phaser/getting-started/making-your-first-phaser-game).

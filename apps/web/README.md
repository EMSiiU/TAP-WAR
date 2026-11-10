# Cliente web de TAP-WAR

Cliente local en React, TypeScript y Phaser. Esta prueba usa jugadores
simulados; no requiere Colyseus ni conexión al servidor Ubuntu.

## Ejecutar en local

Desde la raíz del repositorio, en PowerShell:

```powershell
Set-Location apps\web
npm.cmd ci
npm.cmd run dev
```

Abre la dirección que imprime Vite. Para detener el servidor local,
presiona Ctrl+C en la terminal.

## Verificar la escena

1. Pulsa **Entrar a la arena**. Deben aparecer dos jugadores y un solo canvas.
2. Espera dos segundos. `p1` cambia de posición y `p2` gira hacia arriba
   sin moverse. Deben seguir apareciendo dos jugadores.
3. Pulsa **Salir de la arena**. El canvas debe desaparecer.
4. Entra y sal una segunda vez. La escena debe repetir el estado inicial
   y no duplicar el canvas.

Puedes comprobarlo con `document.querySelectorAll('canvas').length`
en la consola del navegador: debe dar `1` dentro y `0` fuera de la arena.

## Comprobar el código

Desde `apps/web`:

```powershell
npm.cmd run lint
npm.cmd run build
```
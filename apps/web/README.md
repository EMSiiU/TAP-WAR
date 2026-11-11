# Cliente web de TAP-WAR

Cliente en React, TypeScript y Phaser. Para entrar a la arena, usa el servidor
Colyseus local en `127.0.0.1:2567`. Consulta las [versiones del proyecto](../../README.md#tecnologías-y-versiones).

## Ejecutar y verificar en local

Sigue la [prueba local de S1-05](../../docs/prueba-sprint-1.md#prueba-local-de-s1-05)
para iniciar el servidor y el cliente en terminales separadas y comprobar la
sincronización entre pestañas.

Puedes contar los canvas con `document.querySelectorAll('canvas').length`
en la consola del navegador. Debe dar `1` al entrar en la arena y `0` al salir.

## Comprobar el código

Desde `apps/web`:

```powershell
npm.cmd run lint
npm.cmd run build
```
# Cliente web de TAP-WAR

React y TypeScript para la interfaz, Phaser para la arena y Supabase para cuentas/perfiles. La comunicación de juego usa Colyseus.

## Configuración y arranque

Desde la raíz del repositorio, copia apps/web/.env.example a apps/web/.env.local si no existe y completa Project URL y Publishable key. VITE_GAME_SERVER_URL apunta a Colyseus; VITE_GITHUB_AUTH_ENABLED permanece en false hasta configurar GitHub.

```powershell
npm --prefix apps/web ci
npm --prefix apps/web run dev
```

Vite usa http://localhost:5174 con strictPort. Inicia también el servidor siguiendo el [README principal](../../README.md#empezar). La [guía de Supabase](../../docs/autenticacion-supabase.md) describe variables, proveedores y migraciones.

## Flujo de uso

1. Iniciar sesión por correo/contraseña o Google. El registro exige al menos 8 caracteres de contraseña.
2. Si falta username, completarlo antes del lobby. No se toma del proveedor social.
3. Desde Mi perfil, editar username y subir/reemplazar/quitar la foto opcional. Las imágenes admitidas son JPG/PNG/WebP hasta 2 MiB, recortadas al centro y guardadas en Storage privado.
4. En el lobby, elegir personaje, arma y mira. Guardar preferencias o entrar a la arena.
5. Salir de la arena conserva la sesión. Cerrar sesión desconecta también el juego.

La foto no reemplaza el personaje. El cambio de username se aplica al siguiente ingreso. Para dos cuentas distintas usa contextos de navegador independientes; las pestañas del mismo origen comparten sesión.

SMTP y recuperación quedan pendientes. La demostración sin SMTP requiere desactivar Confirm email en el proyecto de Supabase; para registros públicos debe activarse y configurarse el envío.

## Verificación

```powershell
npm --prefix apps/web test
npm --prefix apps/web run build
```

Hay 11 pruebas de validación y coordinación de guardado con servicios simulados. npm run lint también está disponible. Para comprobar limpieza del canvas, document.querySelectorAll('canvas').length debe ser 1 en arena y 0 fuera. Ver [estado de validación](../../docs/estado-actual.md).

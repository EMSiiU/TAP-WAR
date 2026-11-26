# Autenticación y perfiles con Supabase

## Alcance

Cuenta obligatoria para jugar. Acceso por correo/contraseña y Google; GitHub es opcional y requiere configurar su proveedor. Contraseña mínima: 8 caracteres.

Todos eligen username después de autenticar y antes de entrar al lobby, independientemente del proveedor. El username admite de 3 a 20 letras ASCII, números y guion bajo, conserva su escritura y es único sin distinguir mayúsculas. Mi perfil permite editarlo y gestionar una foto opcional. Los cambios de nombre se aplican al siguiente ingreso a la arena; no hay todavía límite de frecuencia de cambios.

Supabase permanece alojado en su servicio. React/Vite y Colyseus se ejecutan en desarrollo o en el servidor de la aplicación. SMTP, recuperación y cambio de contraseña desde el perfil son trabajo posterior.

## Modelo y permisos

- auth.users administra cuentas, proveedores y credenciales; no se crea otra tabla de contraseñas.
- public.profiles tiene id como PK/FK a auth.users.id con borrado en cascada, username, preferred_skin, preferred_weapon, crosshair_style y fechas. La segunda migración añade avatar_path.
- Un trigger crea el perfil con username NULL. La elección inicial completa el perfil; Colyseus rechaza cuentas sin nombre válido.
- Un CHECK valida formato y un índice único sobre lower(username) resuelve duplicados, incluidos los intentos simultáneos.
- RLS limita SELECT/UPDATE al UUID de la sesión. Solo username, preferencias y avatar_path son editables desde el cliente; UUID y fechas quedan protegidos. El trigger mantiene updated_at.
- La foto vive en un bucket privado. El perfil guarda la ruta del archivo, nunca una URL firmada.

## Variables de entorno

Copia los ejemplos sin sobrescribir una configuración existente:

| Aplicación | Archivo | Variables |
| --- | --- | --- |
| Web | apps/web/.env.local | VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_GAME_SERVER_URL, VITE_GITHUB_AUTH_ENABLED |
| Colyseus | apps/game-server/.env | SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY |

Project URL y Publishable key se obtienen en Connect o Settings → API Keys. Usa la clave sb_publishable_ del proyecto. No pongas claves secret/service_role, contraseñas de base de datos o secretos OAuth en variables VITE_* ni en el repositorio.

El servidor carga .env con `npm run dev`. Reinicia Vite al cambiar sus variables. Los archivos reales se ignoran en Git; los .env.example contienen placeholders.

## Configuración de Auth

### Origen y retornos

El origen de desarrollo es http://localhost:5174. vite.config.ts fija puerto 5174 y strictPort; si está ocupado, detén la otra instancia. Cambiar puerto/hostname requiere actualizar también los retornos y orígenes de OAuth.

En Authentication → URL Configuration:

| Campo | Valor de desarrollo |
| --- | --- |
| Site URL | http://localhost:5174 |
| Redirect URL de acceso | http://localhost:5174/auth/callback |
| Redirect URL reservada para recuperación | http://localhost:5174/auth/reset-password |

La primera ruta se procesa mediante el SDK con PKCE. La pantalla de recuperación aún no existe. En producción configura el dominio HTTPS y retornos exactos.

### Correo y contraseña

En Authentication → Sign In / Providers → Email:

- Permitir registros y habilitar el proveedor Email.
- Minimum password length: 8, igual que el formulario.
- Deshabilitar acceso anónimo.
- Para una demostración cerrada sin SMTP, desactivar Confirm email permite acceso inmediato. No verifica la titularidad del correo y afecta a todo el proyecto, no solo al navegador de desarrollo.
- Antes de abrir registros públicos, activar Confirm email y configurar envío de correo.

Con Confirm email activo, el cliente muestra el paso de confirmación y depende de la entrega del mensaje. El correo predeterminado de Supabase limita destinatarios al equipo del proyecto y no sustituye un SMTP para jugadores externos.

### Google

1. En Authentication → Sign In / Providers → Google, copiar el callback del proyecto: https://<project-ref>.supabase.co/auth/v1/callback.
2. En Google Auth Platform, preparar proyecto, nombre de aplicación, correo de soporte/contacto y audiencia External. Durante Testing añadir las cuentas que probarán en Test users.
3. Crear un OAuth Client ID de tipo Web application:
   - Authorized JavaScript origins: http://localhost:5174.
   - Authorized redirect URIs: el callback HTTPS de Supabase.
4. Guardar Client ID y Client Secret en el proveedor Google de Supabase y habilitarlo. Conservar las comprobaciones de seguridad predeterminadas.

El callback del proveedor apunta a Supabase alojado aunque la app corra en desarrollo. No usar el puerto 54321 salvo que se haya instalado una instancia local de Supabase.

### GitHub, opcional

Crear una OAuth App en GitHub → Settings → Developer settings → OAuth Apps. Usar el origen de la aplicación como Homepage URL y el callback de Supabase como Authorization callback URL. Guardar Client ID/Secret en el proveedor GitHub de Supabase y habilitarlo. Después establecer VITE_GITHUB_AUTH_ENABLED=true y reiniciar Vite. Mantenerlo en false mientras el proveedor no esté preparado.

### Identidades y contraseña

Supabase puede vincular identidades con el mismo correo según sus controles de verificación. Cuando se vinculan, conservan el UUID y el perfil. Correos distintos no se vinculan automáticamente.

Una cuenta creada por Google/GitHub no recibe la contraseña del proveedor. Para añadir acceso por contraseña hay que establecer una desde la sesión autenticada mediante updateUser; repetir el registro no es el mecanismo de vinculación. La pantalla para esta operación está pendiente.

## Migraciones para un proyecto nuevo

Aplicar en orden, una sola vez. Si el proyecto ya está configurado, usar las consultas de inspección; no repetir migraciones ni borrar objetos para resolver conflictos. Ambas migraciones terminan con COMMIT y conservan sus cambios.

### 1. Perfiles

Archivo: [20261120000100_create_profiles.sql](../supabase/migrations/20261120000100_create_profiles.sql).

Antes de ejecutarlo, comprobar que public.profiles no existe y revisar triggers propios sobre auth.users y funciones llamadas create_profile_for_auth_user o touch_profile_updated_at. La migración crea tabla, restricciones, índice, RLS, permisos y triggers, y cubre cuentas anteriores. No copia username de metadata del proveedor. Las funciones usan search_path vacío y tablas calificadas; la función de alta es SECURITY DEFINER y no permite ejecución directa desde roles públicos.

Comprobar tabla, RLS, dos políticas y el índice profiles_username_unique. Una cuenta nueva debe generar un perfil con el mismo UUID y username NULL. Un trigger defectuoso puede bloquear registros.

Pruebas manuales con dos perfiles existentes:

- [profiles_rls_manual.sql](../supabase/tests/profiles_rls_manual.sql): permisos y aislamiento de filas con roles/identidades simulados.
- [profiles_username_manual.sql](../supabase/tests/profiles_username_manual.sql): formato, límites, unicidad sin distinguir mayúsculas y varios NULL.

Ejecutar cada archivo completo desde SQL Editor como postgres. Cambian al rol authenticated/anon durante las comprobaciones y terminan con ROLLBACK. Si fallan antes del final, ejecutar ROLLBACK por separado. No acreditan por sí solos el flujo de la API con JWT reales.

### 2. Fotos de perfil

1. Ejecutar [profile_avatars_preflight.sql](../supabase/tests/profile_avatars_preflight.sql) antes de una primera instalación. Esperado: profiles_existe=true y tres conteos en cero. Si hay columna, bucket o políticas de Storage anteriores, revisar sus definiciones; otras políticas permisivas pueden ampliar el acceso.
2. Ejecutar [20261120000200_profile_avatars.sql](../supabase/migrations/20261120000200_profile_avatars.sql).
3. Ejecutar [profile_avatars_verify.sql](../supabase/tests/profile_avatars_verify.sql). Todos los valores deben ser true. Esta inspección confirma estructura, no las operaciones reales ni su aislamiento.

### 3. Controles por cuenta y dispositivo

Archivo: [20261126000100_user_device_controls.sql](../supabase/migrations/20261126000100_user_device_controls.sql).

Crea la tabla `public.user_device_controls` (`primary key (account_id, device_key)`) para guardar configuraciones de teclado/ratón (`pc_controls`) y distribución táctil personalizada (`touch_layout`) separadas por cuenta y dispositivo (`desktop` | `mobile` | `tablet`). Incluye políticas RLS para que cada usuario autenticado (no anónimo) lea y edite solo sus filas, validación de tamaño JSON y poda automática a un máximo de 20 dispositivos por cuenta. Si aún no se ha aplicado en el proyecto remoto de Supabase, el cliente degrada de forma segura a caché local (`localStorage`).

Prueba SQL de verificación: [user_device_controls_manual.sql](../supabase/tests/user_device_controls_manual.sql) (ejecutar completo en SQL Editor; termina con `ROLLBACK`).

### 4. Despliegue automático con GitHub Actions

El workflow [supabase-migrations.yml](../.github/workflows/supabase-migrations.yml) aplica automáticamente las migraciones de `supabase/migrations/` al proyecto remoto de Supabase cuando entra un commit a `main` (o manualmente desde GitHub → **Actions** → *Supabase Migrations* con opción `dry_run`):

- Secretos requeridos en **GitHub → Settings → Secrets and variables → Actions**:
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_DB_PASSWORD`
- Antes de ejecutar `supabase db push --remote --yes --include-all`, [bootstrap-legacy-migrations.mjs](../supabase/scripts/bootstrap-legacy-migrations.mjs) inspecciona en modo solo lectura si las tablas heredadas iniciales (`20261120000100`, `20261120000200`, `20261123000100`) ya fueron creadas manualmente en SQL Editor y registra solo las faltantes en `supabase_migrations.schema_migrations` para evitar colisiones, aplicando después de forma automática las migraciones recientes pendientes (`20261123000200` y `20261126000100`).

El bucket avatars es privado, admite WebP hasta 2 MiB y usa `<UUID-cuenta>/<UUID-archivo>.webp`. CHECK de profiles impide apuntar a otra carpeta. Las políticas de Storage permiten SELECT/INSERT/DELETE en la carpeta propia; no se añade UPDATE porque se usan nombres nuevos al reemplazar. El privilegio de UPDATE de avatar_path se añade a los permisos de perfil existentes.

La interfaz acepta JPG/PNG/WebP hasta 2 MiB, decodifica y recorta al centro a 512 × 512 y convierte a WebP. La foto aparece en el perfil/lobby propio, separada del personaje. No se publica en el estado de la arena.

ProfileAvatar genera URLs firmadas de una hora y las renueva mientras muestra la imagen. Quien posea un enlace firmado puede usarlo durante su vigencia. No se guarda la URL en Postgres.

## Comportamiento del cliente y del servidor

- AuthApp restaura sesión, carga el perfil y exige elegir username antes del lobby.
- ProfileEditor edita username/foto y compara updated_at para impedir sobrescribir cambios de otra pestaña.
- El lobby guarda personaje, arma y mira antes de entrar. Salir de arena conserva la cuenta; cerrar sesión desmonta el juego y cierra la conexión.
- Colyseus verifica getUser(token) y consulta el perfil con ese JWT, sujeto a RLS. Usa un cliente Supabase aislado por solicitud; no necesita claves administrativas.
- El UUID de cuenta se mantiene privado; sessionId identifica la conexión. No se sincronizan correos ni tokens.
- Al renovar sesión se envía auth_refresh. El servidor exige la misma cuenta y actualiza el vencimiento; si vence o falla la verificación, cierra con 4001. Ver el [contrato](contrato-cliente-servidor.md).

Al reemplazar foto: subir nueva → guardar referencia → borrar anterior. Ante una escritura rechazada se intenta retirar el archivo nuevo; ante un fallo ambiguo de red se conserva por si ya está referenciado. Quitar foto borra primero la referencia. Storage y Postgres no forman una operación atómica: fallos de conexión pueden dejar archivos huérfanos. La limpieza es de mejor esfuerzo; eliminar una cuenta no elimina automáticamente sus archivos.

## SMTP y recuperación, etapa posterior

La interfaz aún no ofrece recuperación. El flujo previsto es resetPasswordForEmail con redirectTo a /auth/reset-password, validación de la sesión de recuperación y updateUser para establecer la contraseña nueva. La respuesta al solicitar el enlace debe ser genérica, exista o no la cuenta.

Para SMTP con Gmail, si la cuenta permite contraseñas de aplicación: habilitar verificación en dos pasos, generar una credencial dedicada e introducirla únicamente en Supabase. Host smtp.gmail.com, puerto 587 con TLS/STARTTLS; usuario y remitente son el correo completo. Nunca usar la contraseña normal ni guardar la credencial en el repositorio. Guardar configuración no acredita entrega real.

## Validación

Desde la raíz del repositorio:

```powershell
npm --prefix apps/web test
npm --prefix apps/web run build
npm --prefix apps/game-server test
node apps/web/node_modules/typescript/bin/tsc -p apps/game-server
```

Los tests usan servicios simulados. Para probar el servicio real: registrar/iniciar sesión, completar perfil, guardar preferencias, recargar, subir/reemplazar/quitar foto, entrar/salir de arena y cerrar sesión. Repetir con dos cuentas en contextos independientes; comprobar username ocupado y permisos de perfil/Storage cruzados. Probar además retorno OAuth y renovación prolongada. Los resultados disponibles están en [estado-actual.md](estado-actual.md).

## Referencias oficiales

- [Perfiles y triggers](https://supabase.com/docs/guides/auth/managing-user-data), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [permisos de columnas](https://supabase.com/docs/guides/database/postgres/column-level-security).
- [Identidades](https://supabase.com/docs/guides/auth/auth-identity-linking), [seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security) y [retornos](https://supabase.com/docs/guides/auth/redirect-urls).
- [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [GitHub](https://supabase.com/docs/guides/auth/social-sign-in/auth-github) y [claves](https://supabase.com/docs/guides/getting-started/api-keys).
- [Storage](https://supabase.com/docs/guides/storage/security/access-control), [buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets) y [URLs firmadas](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).
- [Recuperación de contraseña](https://supabase.com/docs/guides/auth/passwords), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) y [contraseñas de aplicación de Google](https://support.google.com/accounts/answer/185833?hl=es).

# Estado actual de TAP-WAR

Actualizado el 20 de noviembre de 2026. Este documento resume el alcance implementado y la evidencia disponible; no sustituye la aceptación del equipo ni el estado del Project.

## Funcionalidad implementada

| Área | Comportamiento |
| --- | --- |
| Arena | Cuatro conexiones; movimiento, colisiones y combate autoritativos |
| Combate | Diez armas de fuego/melé, munición, pickups, daño, bajas y reaparición |
| Partida | Espera, inicio con dos participantes, 180 segundos o 10 bajas, empate, resultados, revancha y pausa |
| Acceso | Registro/login por correo y contraseña, Google y restauración de sesión; contraseña de al menos 8 caracteres |
| Perfil inicial | Elección obligatoria de username después de autenticar y antes del lobby |
| Mi perfil | Edición de username y foto opcional, con subida, reemplazo y eliminación |
| Preferencias | Personaje, arma y mira persistentes por cuenta |
| Servidor | Token verificado, nombre obtenido del perfil y rechazo de cuentas anónimas o incompletas |
| Sesiones | Salir de arena conserva la cuenta; cerrar sesión desconecta el juego; vencimiento y renovación del token |
| Datos | Perfiles con RLS e índice único lower(username); fotos en bucket privado y carpeta por UUID |

La configuración manual de perfiles y Storage se completó. La comprobación funcional de fotos contra el servicio debe registrarse por separado: aplicar el esquema no acredita por sí solo subida, descarga ni aislamiento entre cuentas.

## Pruebas acreditadas

| Comprobación | Resultado y alcance |
| --- | --- |
| Cliente: npm test | 11 pruebas correctas de validación y guardado de perfil/foto; gateway simulado |
| Cliente: npm run build | TypeScript y compilación de producción correctos |
| Servidor: npm test | 9 pruebas correctas de autenticación, vencimiento y limpieza; proveedor/temporizadores simulados |
| TypeScript del servidor | Sin errores |
| Colyseus real en desarrollo | /health respondió 200; name/userId inventados sin token fueron rechazados con AUTH_FAILED |
| Perfiles en Supabase | Tabla, RLS, dos políticas, trigger e índice único comprobados; creación automática de perfil confirmada |
| Prueba SQL de RLS | PASS de aislamiento A/B, edición propia, columnas protegidas y acceso anon denegado, con roles simulados |
| Prueba SQL de username | PASS de límites 3/20, diez formatos inválidos, duplicados por mayúsculas y varios NULL |
| Navegador | Formularios de acceso/registro y perfil inicial; username obligatorio, vista previa 512 × 512 y retirada de foto |

Las pruebas SQL usan ROLLBACK. La prueba visual de foto utilizó un archivo de prueba sin guardarlo en Supabase. Los resultados históricos de S1-05 y S1-06 permanecen en [prueba-sprint-1.md](prueba-sprint-1.md).

## Validación pendiente

- Registro/login por correo y retorno completo de Google con cuentas reales.
- Vinculación por el mismo correo y establecimiento de contraseña en una cuenta creada por OAuth.
- Guardado y recarga de perfil/preferencias mediante la interfaz, y username ocupado desde dos sesiones.
- Subida, reemplazo, eliminación y persistencia real de fotos; permisos de Storage entre dos cuentas.
- Partida completa con dos cuentas independientes, logout y renovación prolongada del token.
- Despliegue en Ubuntu y prueba desde redes distintas.

## Trabajo pendiente de implementación

- Salas por código, inicio manual, persistencia de partidas y ranking por puntos: ver [próximos pasos](proximos-pasos.md) para acuerdos, reglas pendientes y criterios de aceptación.
- SMTP y recuperación de contraseña.
- Configuración y prueba de GitHub OAuth.
- Pantalla de seguridad para establecer/cambiar contraseña.
- Persistencia de resultados y política de frecuencia para cambios de username.
- Limpieza automática de archivos huérfanos o de cuentas eliminadas en Storage.

La demostración admite desactivar Confirm email; es una opción del proyecto de Supabase y afecta a todos sus clientes. Para registros públicos se requiere confirmar correo y preparar el envío. Ver [configuración de autenticación](autenticacion-supabase.md).

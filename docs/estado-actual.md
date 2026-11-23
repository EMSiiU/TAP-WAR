# Estado actual de TAP-WAR

Actualizado el 23 de noviembre de 2026. Este documento resume el alcance implementado y la evidencia disponible; no sustituye la aceptación del equipo ni el estado del Project.

## Funcionalidad implementada

| Área | Comportamiento |
| --- | --- |
| Salas múltiples | Creación dinámica de salas públicas (listadas en `GET /api/rooms`) o privadas por código de 6 caracteres, con limpieza automática al vaciarse |
| Capacidad y mapas | Tres tamaños sincronizados: 4 jugadores (Pequeño `1024×768`), 10 (Mediano `1600×1152`) y 20 (Grande `2240×1600`), con cámara seguidora y minimapa |
| Controles | PC (WASD + ratón/ESPACIO), móvil/tablet (joysticks táctiles gemelos + botón de pantalla completa) y mandos USB/Bluetooth (Gamepad API) |
| Arena | Movimiento analógico/digital, colisiones, pickups y combate autoritativos por mapa |
| Combate | Diez armas de fuego/melé, munición, pickups, daño, bajas y reaparición |
| Partida | Inicio manual del anfitrión con dos participantes, 300 segundos o 20 kills; empate, abandono, resultados y revancha; menú personal sin pausa global |
| Acceso | Registro/login por correo y contraseña, Google y restauración de sesión; contraseña de al menos 8 caracteres |
| Perfil inicial | Elección obligatoria de username después de autenticar y antes del lobby |
| Mi perfil | Edición de username y foto opcional, con subida, reemplazo y eliminación |
| Preferencias | Personaje, arma y mira persistentes por cuenta |
| Servidor | Token verificado, nombre obtenido del perfil y rechazo de cuentas anónimas o incompletas |
| Sesiones | Salir de arena conserva la cuenta; cerrar sesión desconecta el juego; vencimiento y renovación del token |
| Ranking | Tabla global con fotos, puntos y puestos compartidos; búsqueda, paginación y gráfica top 10, solo autenticados |
| Mis estadísticas | Tarjetas, rendimiento en diez partidas, distribución de resultados e historial propio |
| Persistencia de partidas | Migración preparada; escritura exclusiva del servidor y cola local de reintentos. Activación remota pendiente |
| Datos | Perfiles con RLS e índice único lower(username); fotos en bucket privado y carpeta por UUID |

La configuración manual de perfiles y Storage se completó. La comprobación funcional de fotos contra el servicio debe registrarse por separado: aplicar el esquema no acredita por sí solo subida, descarga ni aislamiento entre cuentas.

## Pruebas acreditadas

| Comprobación | Resultado y alcance |
| --- | --- |
| Cliente: npm test | 18 pruebas correctas de perfil/foto, URL del servidor, Gamepad y códigos/mapas; gateways simulados |
| Cliente: npm run build | TypeScript y compilación de producción correctos |
| Servidor: npm test | 30 pruebas correctas de autenticación, infraestructura, salas, mapas, entrada analógica, puntuación y recuperación de resultados; servicios simulados |
| TypeScript del servidor | Sin errores |
| Colyseus real en desarrollo | /health respondió 200; name/userId inventados sin token fueron rechazados con AUTH_FAILED |
| Perfiles en Supabase | Tabla, RLS, dos políticas, trigger e índice único comprobados; creación automática de perfil confirmada |
| Prueba SQL de RLS | PASS de aislamiento A/B, edición propia, columnas protegidas y acceso anon denegado, con roles simulados |
| Prueba SQL de username | PASS de límites 3/20, diez formatos inválidos, duplicados por mayúsculas y varios NULL |
| Navegador | Formularios de acceso/registro y perfil inicial; username obligatorio, vista previa 512 × 512 y retirada de foto |

Las pruebas SQL usan ROLLBACK. La prueba visual de foto utilizó un archivo de prueba sin guardarlo en Supabase. Los resultados históricos de S1-05 y S1-06 permanecen en [prueba-sprint-1.md](prueba-sprint-1.md).

La nueva migración de rankings se verificó en PostgreSQL 18 local con Auth/Storage simulados; la prueba SQL de rankings devuelve PASS y usa ROLLBACK. La revisión visual del bloque y la API remota siguen pendientes. Ver [activación de rankings](rankings.md).

## Validación pendiente

- Registro/login por correo y retorno completo de Google con cuentas reales.
- Vinculación por el mismo correo y establecimiento de contraseña en una cuenta creada por OAuth.
- Guardado y recarga de perfil/preferencias mediante la interfaz, y username ocupado desde dos sesiones.
- Subida, reemplazo, eliminación y persistencia real de fotos; permisos de Storage entre dos cuentas.
- Partida completa con dos o más cuentas independientes en salas públicas/privadas (4, 10 y 20 jugadores), logout y renovación prolongada del token.
- Pruebas en dispositivos móviles (controles táctiles y pantalla completa) y mandos físicos USB/Bluetooth.
- Aplicar la migración [`20261123000200_expand_match_capacity.sql`](../supabase/migrations/20261123000200_expand_match_capacity.sql) en Supabase remoto para persistir partidas de 5 a 20 jugadores.

## Trabajo pendiente de implementación

- Reconexión con reserva de participación durante 30 segundos: ver [próximos pasos](proximos-pasos.md).
- SMTP y recuperación de contraseña.
- Configuración y prueba de GitHub OAuth.
- Pantalla de seguridad para establecer/cambiar contraseña.
- Política de frecuencia para cambios de username.
- Limpieza automática de archivos huérfanos o de cuentas eliminadas en Storage.

La demostración admite desactivar Confirm email; es una opción del proyecto de Supabase y afecta a todos sus clientes. Para registros públicos se requiere confirmar correo y preparar el envío. Ver [configuración de autenticación](autenticacion-supabase.md).

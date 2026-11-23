# Ranking global y Mis estadísticas

Implementación local del bloque, 23 de noviembre de 2026. Falta aplicar la migración y configurar la clave del servidor en cada entorno. El código no modifica automáticamente el proyecto de Supabase.

## Activación

1. En Supabase → SQL Editor, ejecutar **completo** `supabase/migrations/20261123000100_match_rankings.sql`. Requiere las dos migraciones anteriores de perfiles y fotos. No volver a ejecutar las anteriores si ya están aplicadas.
2. En Settings → API Keys, obtener una clave **secret** del proyecto. Agregar `SUPABASE_SECRET_KEY=...` a `apps/game-server/.env` en desarrollo, o al `.env` raíz usado por Docker Compose. Mantener las variables existentes `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. La clave secret solo pertenece al servidor: nunca usar `VITE_`, pegarla en el chat ni incluirla en Git.
3. Configurar `MATCH_DATA_DIR` en un disco persistente. En desarrollo el valor predeterminado es `.data/matches`, relativo al directorio desde el que se ejecuta el servidor. Docker Compose monta automáticamente el volumen `match-results` en `/app/.data`. Ejecutar un solo proceso de Colyseus por directorio.
4. Reiniciar ambos servicios. Desde la raíz, desarrollo usa dos terminales:

   ```powershell
   npm --prefix apps/game-server run dev
   npm --prefix apps/web run dev
   ```

   En el servidor con Docker Compose:

   ```sh
   docker compose up -d --build
   ```

5. Iniciar sesión y abrir **Rankings y estadísticas** en el lobby. Probar una ronda con dos cuentas distintas. La primera conexión es anfitrión: pulsa **Iniciar partida**. Al finalizar debe aparecer **Resultado guardado**. Volver al lobby y abrir rankings consulta otra vez los datos actuales. Para un resultado todavía pendiente, usar **Actualizar** después de que el servidor confirme el guardado.

Sin la clave privada se conserva el acceso al lobby, pero el servidor rechaza iniciar rondas clasificadas y explica la configuración pendiente. Una clave incorrecta o una migración ausente pueden permitir preparar la ronda y dejar su guardado pendiente: comprobar la activación antes de la demostración.

## Reglas implementadas

- Una sala fija de hasta cuatro jugadores; anfitrión inicia con dos o más. Se bloquean nuevas entradas durante la ronda y hasta que el anfitrión vuelve a espera. No hay salas por código en este bloque.
- Una cuenta ocupa una sola plaza. El anfitrión se transfiere al siguiente jugador conectado si sale.
- Ronda de 300 segundos o 20 kills. Por tiempo gana quien tenga más kills; a igualdad, menos muertes. Los líderes todavía iguales empatan y los demás pierden.
- Victoria: 3 puntos; empate: 1; derrota: 0. El abandono conserva kills y muertes y cuenta como derrota. Si solo queda un participante, gana. Un personaje esperando reaparecer sigue participando.
- ESC abre el menú personal: la simulación y el reloj continúan. Salir o perder la conexión durante una ronda cuenta como abandono inmediato. La reconexión con 30 segundos de reserva sigue pendiente.
- La revancha vuelve a espera; solo el anfitrión la solicita. El siguiente inicio genera otro UUID.
- Ranking acumulativo con puestos densos: 1, 1, 2. El username ordena visualmente las igualdades. Un perfil con username y sin partidas aparece al final, en cero y sin clasificar. Cambiar username conserva los resultados de la cuenta.
- Las partidas interrumpidas quedan excluidas de todos los totales e historiales competitivos. No hay recuperación de rondas históricas que nunca se guardaron.

## Datos y permisos

`matches` y `match_results` guardan cada cierre en una transacción. El navegador no tiene acceso directo a estas tablas ni a la vista interna `ranking_totals`. La RPC `record_match_result(payload)` solo es ejecutable por `service_role`, usado por la clave secret en Colyseus. Una repetición idéntica no suma otra vez; un mismo UUID con contenido distinto se rechaza.

`get_rankings(search, page)` devuelve la clasificación, veinte filas por página, destacados y posición propia. La búsqueda no recalcula los puestos. `get_my_statistics(page)` toma la identidad de `auth.uid()` y devuelve resumen propio, historial paginado y últimas diez partidas. Ambas rechazan sesiones anónimas; no aceptan un UUID de otra cuenta para consultar historial personal.

La política de perfiles sigue limitada al propietario. El bucket de avatares permanece privado. Una política adicional permite a usuarios autenticados leer únicamente las fotos **actuales** de perfiles completos. No amplía escritura ni borrado. El cliente solicita enlaces temporales de una hora y usa el personaje cuando no hay foto o falla. Un enlace firmado ya emitido puede funcionar hasta que venza; no es una comprobación de sesión en cada descarga. No compartir estos enlaces fuera de la aplicación.

## Guardado y recuperación

Antes de iniciar, el servidor escribe un registro local con UUID y participantes. Al cerrar, congela el resultado completo, escribe el archivo y llama a Supabase. Los reintentos se realizan cada quince segundos. Si se pierde la respuesta, repite el mismo UUID; la base evita duplicarlo. Un archivo completado pendiente se recupera tras reiniciar. Una ronda que estaba abierta al reiniciar se registra como interrumpida con cero puntos; no se reconstruye su simulación ni sus kills.

La pantalla distingue guardando, guardado, pendiente y fallo de disco. Pendiente permite revancha porque existe un archivo local; fallo de disco la bloquea y mantiene el cierre en memoria para reintentar. Si el proceso cae antes de que se escriba ese cierre, solo podrá recuperarse la marca de ronda interrumpida. Un volumen borrado o efímero no conserva archivos pendientes. No eliminar el volumen con `docker compose down -v` si tiene resultados pendientes.

El plan gratuito de Render descrito en `render.yaml` no ofrece aquí un disco persistente: puede perder pendientes al recrear el contenedor. Para demostrar recuperación usar Ubuntu con el volumen de Compose, o configurar un servicio con disco persistente. Las partidas ya confirmadas en Supabase no dependen del volumen local.

## Comprobaciones

- Cliente: quince pruebas existentes y compilación de producción.
- Servidor: veintiséis pruebas de autenticación, infraestructura, puntuación, abandono, fallo de disco y recuperación de pendientes.
- TypeScript del servidor sin errores.
- Migraciones ejecutadas en PostgreSQL 18 temporal local con esquemas Auth/Storage simulados. `supabase/tests/rankings_manual.sql` devuelve PASS para puntuación, idempotencia, atomicidad, igualdad de puestos, historial propio y permisos. Finaliza con ROLLBACK. No acredita JWT reales, API de Storage ni configuración del proyecto remoto.
- Pendiente: prueba visual en navegador y prueba completa con dos sesiones reales, Storage y Supabase remoto, después de activar este bloque.

La prueba SQL puede ejecutarse completa en SQL Editor como administrador después de aplicar la migración. Crea cuentas sintéticas solo dentro de la transacción y revierte todo. Si una comprobación falla, ejecutar ROLLBACK antes de continuar.

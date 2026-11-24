# Escenarios y geometría compartida

Actualizado el 24 de noviembre de 2026. Implementación local; requiere reiniciar cliente y servidor con la misma versión para probar o desplegar.

## Escenarios disponibles

| Escenario | Diseño | Capacidades |
| --- | --- | --- |
| Cantera del desierto | Suelo de arena, caminos y coberturas rocosas. Se conserva la geometría del desierto y se elimina la dispersión automática de piezas de objetos sobre el suelo. | 4, 10 y 20 |
| Planta industrial | Patio central, corredores y sectores de almacén, con maquinaria y cajas sólidas colocadas deliberadamente. Cada tamaño tiene su propia distribución de coberturas. | 4, 10 y 20 |

En Crear sala, elegir primero el escenario y después la capacidad. Los planos previos muestran coberturas, apariciones (verde) y puntos de armas (amarillo). La selección no obliga a usar una capacidad concreta: ambos escenarios admiten los tres tamaños. El tamaño físico continúa asociado a la capacidad: 1024×768, 1600×1152 o 2240×1600.

El servidor valida `environment` (`desert` o `industrial`) al crear la sala. Si falta o no es válido, usa `desert`. Lo sincroniza en `ArenaState` y en los metadatos públicos. Al unirse por código se usa el escenario de la sala, no una elección del cliente que entra. La revancha conserva el escenario.

## Fuente de los recursos

El tileset publicado en `apps/web/public/assets/maps/tilemap-desert.png` procede de `Pack-recursos/PNG/Tiles/Tilemap/tilemap_packed.png`. Se reutiliza el pack existente; no se descargaron nuevos recursos ni se modificaron sus imágenes originales. El nombre del PNG se mantiene por compatibilidad, aunque contiene piezas para los dos escenarios.

El PNG del desierto pequeño y el editable histórico `.tmj` se conservan como fuentes de arte, pero la arena actual ya no usa esa imagen fija. Los seis mapas se dibujan con la misma construcción por capas.

## Una definición para dibujo y colisión

`packages/shared/mapCatalog.ts` contiene tipos, escenarios, planos industriales y construcción de capas. Usa `arena.json` para dimensiones, apariciones, armas y geometría original del desierto. Tanto el cliente como Colyseus obtienen los mapas desde este catálogo.

- **Suelo y rutas:** únicamente piezas de superficies transitables, sin objetos que parezcan sólidos.
- **Coberturas:** cada celda dibujada procede de un rectángulo real de `obstacles`. Las cajas, estructuras y rocas visibles tienen geometría de colisión.
- **Bordes y marcas:** contornos de altura dentro de la cobertura; señalización industrial pintada sobre la maquinaria. Los nombres de sectores son señalización, no obstáculos.
- **Cuadrícula:** piezas fuente de 16×16, dibujadas a 32×32. Todos los rectángulos sólidos están alineados a esa cuadrícula; no se redondea su tamaño visual por separado.

El minimapa, las colisiones de personajes y la representación de la arena consultan los mismos obstáculos. Los cambios futuros deben pasar por el catálogo, sin añadir piezas de objetos al suelo de forma independiente. Los controles móviles y la ventana de resultados tienen correcciones locales documentadas en [estado actual](estado-actual.md). Las incidencias de reloj y recorrido de proyectiles siguen siendo trabajo separado.

## Verificación

- Trece pruebas nuevas del servidor: coincidencia entre celdas sólidas y geometría, apariciones y armas libres, puntos distintos, rutas entre todos ellos y selección autoritativa del escenario.
- Suite completa: 43 pruebas del servidor y 18 del cliente; compilación web y TypeScript del servidor.
- Prueba temporal de integración con dos clientes reales de Colyseus: industrial para 20 jugadores, unión por código, inicio, cierre por abandono y retorno a espera para revancha. Autenticación y persistencia simuladas; no se escribieron resultados en Supabase.
- Se revisaron renderizaciones generales del desierto y de la planta industrial usando el tileset real. La conexión de la herramienta de navegador a la vista local no estuvo disponible; falta comprobar la interacción visual completa con cuentas reales.

## Prueba manual antes del despliegue

1. Reiniciar el servidor de juego y el cliente en desarrollo.
2. Crear una sala de cada escenario y capacidad: seis combinaciones.
3. Entrar desde otra cuenta por código y desde el listado público; confirmar que escenario, tamaño y capacidad coinciden.
4. Recorrer el mapa y comprobar que coberturas y bordes bloquean al personaje, que las marcas del suelo se pueden atravesar y que los puntos de armas son accesibles.
5. Terminar una ronda y volver a espera para verificar que la revancha conserva escenario y capacidad.
6. Comprobar rendimiento y equilibrio con varios jugadores, sobre todo en las variantes grandes. La conectividad geométrica no acredita por sí sola el equilibrio competitivo.

Este bloque no necesita migraciones de Supabase ni nuevas variables de entorno. El soporte de partidas de hasta veinte participantes sigue requiriendo la migración de capacidad ya documentada. Al desplegar, actualizar el cliente y Colyseus juntos; evitar mezclar clientes anteriores con salas industriales nuevas.

# Contrato de arte — primera prueba

Prioridad: comprobar integración y escala antes del acabado. Responsable P4; P2 revisa carga y representación; P3 revisa geometría.

## Personaje

- Entregar `player-idle.png`, PNG RGBA transparente, una imagen estática.
- Propuesta de lienzo: 128 × 128 px; validar escala con P2 antes de dibujar más.
- Personaje centrado horizontalmente, punto de apoyo de pies consistente.
- Conservar fuente editable en `assets/source/` y exportación en la carpeta de recursos del cliente cuando se cree.
- Registrar tamaño, punto de apoyo, autor y licencia/origen de cualquier material externo.
- No incluir fondo, texto ni sombra que altere accidentalmente la lectura del cuerpo de colisión.
- Una imagen de prueba basta. Si hay tiempo: hoja PNG de celdas iguales con caminar en cuatro direcciones; documentar filas, cuadros y FPS. No recortar cada cuadro de manera distinta.

## Mapa

- Primero dibujar esquema visto desde arriba con suelo, bordes, un obstáculo rectangular y cuatro apariciones.
- La arena local mide 1024 × 768 unidades. Para un fondo a escala 1:1, exporta 1024 × 768 píxeles. Confirma con P2/P3 si el arte requiere cambiar las dimensiones.
- Entregar `arena-01.png` para el fondo. Usar [arena.json](../packages/shared/arena.json) como referencia de dimensiones, colisiones y apariciones. Acordar con P2/P3 cualquier cambio de geometría.
- Guardar editable con capas; no hornear elementos que deben tapar al personaje dentro de la capa inferior.
- Comprueba en el cliente que el PNG alinea el obstáculo y las apariciones con la geometría compartida.
- Alternativa si el equipo elige tiles: Tiled editable más exportación JSON y tilesets PNG; validar compatibilidad antes de producir el mapa completo.

## Revisión del día 3

- [ ] PNG cargado sin bordes o fondo accidental.
- [ ] Personaje visible sobre el suelo y distinguible por color/indicador.
- [ ] Obstáculo visual coincide con geometría que usa el servidor.
- [ ] Apariciones dentro de límites y fuera de obstáculos.
- [ ] Archivos y exportaciones documentados; sin rutas absolutas de la computadora del diseñador.

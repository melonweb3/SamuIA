# Escenarios oficiales de referencia

Las cinco imágenes aportadas por el usuario se han inspeccionado visualmente y archivado sin alteración. `archives/` conserva los ZIP recibidos; `originals/` sus PNG exactos de 1672 × 941. `originals-index.json` registra hashes SHA-256 de los ZIP, originales y copias de ejecución. No sobrescribir ni recomprimir estos archivos. Los escenarios no contienen otro comentarista.

## Análisis de las referencias

| Referencia                | Escritorio y monitores                                                                                            | Decoración                                                                | Iluminación                                    | Elementos futbolísticos                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| 01 · Noche roja           | Madera frontal, teclado, ratón, auriculares, micrófono a la izquierda; pantalla lateral con estadio               | Sofá, estantería, plantas, figuras, ventana urbana                        | Rojo intenso, tiras LED y paneles geométricos  | Cuadros y bufandas Celta/Dépor, cojines, balón, copas             |
| 02 · Análisis tecnológico | Madera, dos monitores de datos a la izquierda, PC visible, control de streaming, micrófono a la derecha           | Plantas, libros, robots, maquetas, ventana al mar                         | Azul cian y luz cálida en baldas               | Camiseta del Celta, bandera del Dépor, balón y maqueta de estadio |
| 03 · Charla cálida        | Madera, taza, teclado lateral, micrófono a la izquierda; pantalla con paisaje                                     | Sofá, lámparas, libros, plantas, recuerdos y vista de la ría              | Ámbar doméstico con azul del atardecer         | Bufandas y cojines de ambos equipos, fotografías de estadios      |
| 04 · Previa futbolera     | Madera con alfombrilla, monitor a la izquierda, micrófono de brazo                                                | Paneles de madera, fotos gallegas, plantas y maqueta de faro              | Azul con acentos cálidos                       | Banderas Celta/Dépor, balón clásico, copa, bufandas y estadio     |
| 05 · Setup principal      | Madera, doble monitor lateral, PC RGB, teclado y ratón centrados, micrófono a la derecha, auriculares y controles | Plantas, figuras, baldas, paneles verticales, sofá y fotografías costeras | Azul/violeta técnico con luz ámbar de ambiente | Banderas Celta/Dépor, bufandas, cojín, balones y recuerdos        |

## Composición implementada

La base principal es **05**: combina la zona de trabajo completa con luz azul y cálida y una identidad gallega reconocible. Por petición expresa posterior del usuario, el modo predeterminado integra al personaje y la habitación en un PNG derivado por escena, sin marco ni fondo blanco. Los gráficos y la iluminación siguen siendo capas independientes. Los originales se conservan intactos.

Los cinco fondos se pueden fijar en Ajustes → Escenario del comentarista. El modo automático usa 03 para charla, 02 para tecnología, 01 para tensión y 05 para fútbol, gaming y celebración. 04 queda disponible como variante manual de previa. El predeterminado es 05 fijo: una reacción no cambia de habitación inesperadamente.

Elementos dinámicos preparados:

- Panel de competición derivado del ID de liga del encuentro en foco.
- Rótulos local/visitante, marcador, minuto y estado desde los datos del mismo encuentro. Las alertas secundarias no cambian los gráficos del partido en foco.
- Luz superpuesta azul en fútbol, ámbar en charla, cian en tecnología, violeta en gaming, roja en tensión y verde en celebración. Puede desactivarse.
- Gráficos ocultables independientemente del fondo y el avatar; estado de espera si no hay partido, mensaje y reintento si falta un fondo.
- Fondos embebidos en el HTML portátil: funcionan sin red. El build verifica la integridad de los diez originales y sus ZIP.

Las banderas, bufandas, escudos, monitores y mobiliario ya fotografiados son **fijos en cada PNG**. No se presentan como assets reemplazables. Los rótulos de partido sí son dinámicos; no se inventan escudos de otras competiciones. Los acentos azul/ámbar del marcador distinguen local y visitante, no pretenden ser sus colores oficiales. Para sustituir decoración dentro de las fotos harían falta derivados separados; los originales permanecen intactos.

Los cambios de Ajustes duran la sesión, igual que el resto de la demo. El marcador usa el proveedor local simulado; no implica una conexión a resultados en directo.

## Escenas integradas v2

El usuario pidió expresamente integrar avatar y habitación en una sola imagen el 19 de octubre de 2026. Se generaron cinco composiciones con image_gen usando cada escena original y el retrato oficial 03; se revisaron visualmente cara, gorra, barba, ropa y proporciones visibles. No se muestran manos ni piernas. `assets/runtime/scenes/composites-index.json` registra fuentes, hashes y copias públicas. Estos derivados nunca sobrescriben originales.

Ajustes → Presentación del avatar ofrece **Integrado** (predeterminado: una pose neutra fija por escena, un único PNG) y **Retratos originales** (capas con los cinco retratos intactos, sin el fondo blanco que antes añadía el contenedor CSS). Seleccionar un retrato activa el modo de capas. Las composiciones no tienen animación facial ni cambios de pose; los rótulos indican pose y plano fijos. Los datos del partido y la luz siguen siendo dinámicos.

El HTML portátil contiene los cinco derivados y los diez PNG originales. La edición muestra «Escenas integradas v2». Para actualizar una copia descargada hay que volver a descargar el HTML.

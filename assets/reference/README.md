# Referencia oficial de identidad — SamuIA

El usuario ha designado el **19 de octubre de 2026** una lámina de cinco retratos como referencia oficial del comentarista principal. Las cinco vistas muestran al **mismo personaje**. Son variaciones de expresión y pose; no son identidades alternativas.

## Originales archivados e integrados

Se han recibido los cinco ZIP originales del usuario. Se conservan exactamente sus bytes en `archives/`, y los cinco PNG extraídos, con su nombre original, en `originals/`. Las copias de ejecución en `apps/studio/public/samuia/avatar/` son idénticas a esos PNG, sin recorte, retoque, cambio de tamaño, conversión ni eliminación de metadatos o transparencia.

[originals-index.json](originals-index.json) registra nombres, rutas, dimensiones, tamaños y SHA-256 de cada PNG y de cada ZIP. El manifiesto [identity.json](identity.json) marca la referencia como archivada e integrada. Los originales son 1122 × 1402 píxeles.

| Referencia | Archivo original                                   | Uso                            |
| ---------- | -------------------------------------------------- | ------------------------------ |
| 01         | [avatar_cara_01.png](originals/avatar_cara_01.png) | Sonrisa                        |
| 02         | [avatar_cara_02.png](originals/avatar_cara_02.png) | Pensativo, mano en la barbilla |
| 03         | [avatar_cara_03.png](originals/avatar_cara_03.png) | Neutral, reposo                |
| 04         | [avatar_cara_04.png](originals/avatar_cara_04.png) | Habla, boca abierta            |
| 05         | [avatar_cara_05.png](originals/avatar_cara_05.png) | Serio                          |

La aplicación muestra estos retratos originales en lugar del SVG provisional. El modo automático selecciona una referencia según emoción/gesto y si está hablando; Ajustes permite fijar cualquiera de las cinco. Para sorpresa, risa o enfado sin fotografía propia se usa una de estas referencias del mismo personaje, indicando la vista real. No se han creado expresiones ni personajes nuevos.

El HTML portátil incluye los cinco PNG completos en base64; decodificarlos recupera exactamente los mismos bytes. No necesita descargar imágenes ni depende de una ruta local. Los cambios de cámara son transformaciones visuales de la capa con proporciones conservadas, no ediciones de las imágenes. Si fallan las imágenes, se muestra un aviso; nunca vuelve a aparecer otro personaje de sustitución.

## Rasgos que deben conservarse

| Elemento     | Referencia aprobada                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidad    | Un único personaje masculino adulto: el comentarista SamuIA. No se deduce una identidad real de la fotografía.                                                                                                            |
| Cara         | Rostro alargado, mandíbula definida, nariz recta, labios y proporciones faciales consistentes con la lámina. Conservar asimetrías y textura natural.                                                                      |
| Ojos y cejas | Ojos marrones y cejas oscuras, pobladas y marcadas.                                                                                                                                                                       |
| Pelo         | Corto y oscuro, visible bajo la gorra. Conservar línea del pelo y patillas.                                                                                                                                               |
| Barba        | Barba corta oscura, bigote y sombreado de barba visibles. No cambiar por afeitado completo o barba larga.                                                                                                                 |
| Piel         | Tono cálido, con textura fotográfica natural. Conservar el aspecto de referencia sin aclarar, oscurecer o alisar arbitrariamente.                                                                                         |
| Gorra        | Beige claro, llevada hacia atrás, con correa de ajuste y hebilla visibles en la frente.                                                                                                                                   |
| Ropa         | Sudadera lisa color crema/blanco roto, con capucha y cordones claros. Sin introducir logos, equipaciones deportivas ni otros colores.                                                                                     |
| Complexión   | Conservar las proporciones de cabeza, cuello, hombros y torso superior que aparecen en los retratos. No hay referencia de cuerpo completo.                                                                                |
| Estilo       | Retrato fotográfico realista, no caricatura ni rediseño de animación. La lámina del chat tenía fondo blanco; los PNG originales conservan su propia transparencia y se presentan sobre las escenas sin alterar sus bytes. |

## Las cinco vistas

1. **Superior izquierda:** sonrisa abierta con dientes visibles.
2. **Superior centro:** pose pensativa con la mano en la barbilla.
3. **Superior derecha:** expresión relajada con la boca cerrada.
4. **Inferior izquierda:** boca ligeramente abierta, útil como referencia de habla.
5. **Inferior derecha:** expresión seria/neutra con la boca cerrada.

Estas descripciones identifican las cinco vistas originales; no asignan cinco personajes. Cualquier expresión futura requiere el mismo personaje y aprobación expresa. No se considera aprobado un archivo nuevo solo por tener un nombre como `surprised.png`.

## Aplicación a avatares y escenas

Pueden variar expresión, mirada, gesto, encuadre, iluminación y fondo, manteniendo rostro, pelo, barba, ropa, gorra y proporciones. Las cámaras virtuales son encuadres del mismo personaje. No deben escoger caras distintas para primer plano, plano medio, streamer o tres cuartos.

Los originales de referencia pertenecen a `assets/reference/`. Los derivados se preparan en `assets/runtime/avatar/` y `assets/runtime/scenes/`; su distribución para la aplicación usa `apps/studio/public/samuia/avatar/` y `apps/studio/public/samuia/scenes/`. El mapeo de nombres de ejecución está en `packages/core/src/visual.ts`.

Antes de integrar cada derivado, compararlo con la lámina original. El SVG genérico del MVP ha sido retirado del componente del avatar. No alterar silenciosamente la identidad desde un selector de emoción o cámara.

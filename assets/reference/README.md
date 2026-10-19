# Referencia oficial de identidad — SamuIA

El usuario ha designado el **19 de octubre de 2026** una lámina de cinco retratos como referencia oficial del comentarista principal. Las cinco vistas muestran al **mismo personaje**. Son variaciones de expresión y pose; no son identidades alternativas.

## Estado del archivo original

La lámina es visible en la conversación, pero no se ha recibido una ruta de archivo ni un identificador descargable de esa imagen en el entorno de ejecución. Por tanto:

- La identidad y sus reglas están documentadas y versionadas aquí.
- **El archivo de imagen original todavía no está archivado en el repositorio.**
- No se ha generado, recortado ni editado una imagen sustitutiva.
- El avatar de ejecución todavía utiliza el placeholder técnico del MVP, que no debe confundirse con el personaje aprobado.

El estado verificable está en [identity.json](identity.json). Para archivar la imagen exacta se necesita recibir el PNG/JPG original como archivo adjunto accesible. Al incorporarlo, registrar su ruta y SHA-256; no marcar el original como guardado antes de comprobar que existe.

## Rasgos que deben conservarse

| Elemento | Referencia aprobada |
| --- | --- |
| Identidad | Un único personaje masculino adulto: el comentarista SamuIA. No se deduce una identidad real de la fotografía. |
| Cara | Rostro alargado, mandíbula definida, nariz recta, labios y proporciones faciales consistentes con la lámina. Conservar asimetrías y textura natural. |
| Ojos y cejas | Ojos marrones y cejas oscuras, pobladas y marcadas. |
| Pelo | Corto y oscuro, visible bajo la gorra. Conservar línea del pelo y patillas. |
| Barba | Barba corta oscura, bigote y sombreado de barba visibles. No cambiar por afeitado completo o barba larga. |
| Piel | Tono cálido, con textura fotográfica natural. Conservar el aspecto de referencia sin aclarar, oscurecer o alisar arbitrariamente. |
| Gorra | Beige claro, llevada hacia atrás, con correa de ajuste y hebilla visibles en la frente. |
| Ropa | Sudadera lisa color crema/blanco roto, con capucha y cordones claros. Sin introducir logos, equipaciones deportivas ni otros colores. |
| Complexión | Conservar las proporciones de cabeza, cuello, hombros y torso superior que aparecen en los retratos. No hay referencia de cuerpo completo. |
| Estilo | Retrato fotográfico realista, no caricatura ni rediseño de animación. El fondo blanco de la lámina es de referencia y puede sustituirse por escenas sin alterar al personaje. |

## Las cinco vistas

1. **Superior izquierda:** sonrisa abierta con dientes visibles.
2. **Superior centro:** pose pensativa con la mano en la barbilla.
3. **Superior derecha:** expresión relajada con la boca cerrada.
4. **Inferior izquierda:** boca ligeramente abierta, útil como referencia de habla.
5. **Inferior derecha:** expresión seria/neutra con la boca cerrada.

Estas descripciones ayudan a localizar cada vista; no asignan cinco personajes ni crean cinco assets que todavía no existen. Las expresiones de sorpresa, risa o enfado teatral deberán conservar esta misma identidad cuando se produzcan. No se consideran aprobados archivos nuevos solo por tener un nombre como `surprised.png`.

## Aplicación a avatares y escenas

Pueden variar expresión, mirada, gesto, encuadre, iluminación y fondo, manteniendo rostro, pelo, barba, ropa, gorra y proporciones. Las cámaras virtuales son encuadres del mismo personaje. No deben escoger caras distintas para primer plano, plano medio, streamer o tres cuartos.

Los originales de referencia pertenecen a `assets/reference/`. Los derivados se preparan en `assets/runtime/avatar/` y `assets/runtime/scenes/`; su distribución para la aplicación usa `apps/studio/public/samuia/avatar/` y `apps/studio/public/samuia/scenes/`. El mapeo de nombres de ejecución está en `packages/core/src/visual.ts`.

Antes de integrar cada derivado, compararlo con la lámina original. No usar el SVG genérico del MVP como guía de parecido y no alterar silenciosamente la identidad desde un selector de emoción o cámara.

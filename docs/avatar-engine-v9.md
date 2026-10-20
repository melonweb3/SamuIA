# SamuIA Avatar Engine v9

Esta fase evoluciona el estudio existente. La salida sigue usando los PNG oficiales de SamuIA: ahora un renderer 2D anima regiones del personaje en ejecución. No se han retocado, sustituido ni recomprimido originales, composiciones o ZIP. Los vídeos personales solo se consultan en la biblioteca privada del operador; nunca se usan como imagen del avatar ni entran al compositor.

## Arquitectura encontrada y reutilizada

Antes de v9, `CommentaryEngine` y `SamuIABrain` creaban decisiones con texto, emoción, intensidad y animación. `ReactionDirector` coordinaba memoria, prioridad, cola, `VoiceController` y `AvatarAnimationController`. Voice Studio v8 ya entregaba inicio/fin, progreso y amplitud; el controlador calculaba cabeza, cuerpo, parpadeo y boca, pero el fallback visible era una fotografía inmóvil. Existían el host de adaptadores y `VideoCompositor` para la salida propia.

Se conserva ese recorrido, sus proveedores y sus pantallas:

```text
partidos SIMULATION / LIVE, chats u operador
  → SamuIABrain / CommentaryEngine
  → ReactionEvent / ReactionDirector
  → VoiceController + AvatarAnimationController
  → ReactionLibrary + estado Avatar Engine
  → OfficialImageRenderer
  → preview / VideoCompositor / productor existente
```

`packages/avatar-engine` aporta tipos, catálogo y selección; no crea otro director, scheduler ni cerebro. El controlador anterior es propietario de la biblioteca y los ajustes. `StudioSnapshot.animation.engine` expone estado visual, emoción, intensidad, animación, asset, audioLevel, speechProgress, texto, fuente de lip-sync, override manual, fase, modo solicitado/efectivo y motivo de fallback. Se conserva también el contrato de clips anterior: goal, shock, var, penalty, win, loss, etc.

## Qué se anima realmente

`OfficialImageRenderer` lee la composición seleccionada completa, con su encuadre 1672×941. Una malla local aplica inclinación de cabeza, respiración y pequeños desplazamientos de torso. Cada una de las cinco composiciones tiene calibración propia; el desplazamiento decae fuera del personaje. Fondo, escritorio y zona protegida del micrófono permanecen fijos. No se desplaza la habitación para simular una celebración.

El parpadeo comprime regiones de los párpados. La boca usa capas recortadas en memoria de los retratos oficiales 04 (habla) y 01 (sonrisa), con borde suavizado y adaptación de iluminación. Se ajustan apertura y posición al frame del personaje. No se generan caras, no se exportan derivados y no se modifica ningún archivo de imagen. Hay sonrisa y movimiento de habla básicos; enfado, tristeza, sorpresa y otras emociones se distinguen principalmente por postura, intensidad, patrón y estado indicado en pantalla. No hay musculatura facial completa ni nuevas expresiones fotográficas de todos los estados.

La animación está disponible en la presentación integrada de las cinco escenas. El visor de retratos originales sigue siendo una referencia estática. Reaction Studio muestra la presentación integrada sin cambiar la elección global del usuario. Un adaptador externo puede seguir sustituyendo al renderer a través del host existente.

`static` conserva la composición sin movimiento. Desactivar el avatar desactiva sus movimientos y mantiene el fallback visible. `animated-2d` funciona; `motion-driven` y `future-advanced` indican fallback a 2D, porque no hay extractor ni rig avanzado instalados. El renderer respeta reducción de movimiento del navegador.

## Boca y voz

El estado de reproducción real de `VoiceController` gobierna la apertura: preparación, pausa, fin y cancelación cierran la boca. Hay suavizado entre niveles y caducidad de la amplitud para evitar valores congelados. `speechProgress` comparte el reloj de voz; `emotion`, `intensity` y la receta regulan la reacción.

| Fuente de prueba        | Qué conduce la boca                                              | Requisito                                           |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| Simulación              | Estimación por texto/reloj, sin sonido                           | Ninguno                                             |
| Voz local del navegador | Estimación por texto y eventos de SpeechSynthesis                | Voz local instalada; disponibilidad según navegador |
| Flite                   | RMS medido por Web Audio durante la reproducción                 | Backend, FFmpeg con Flite y FFprobe                 |
| Audio de prueba         | RMS de un tono generado localmente; **no es voz**                | HTML portátil y Web Audio                           |
| TTS de Voice Studio     | Amplitud del audio reproducido, cuando el proveedor genera audio | Backend y configuración del proveedor               |

La medición de amplitud es real en las fuentes de audio indicadas; la apertura por amplitud no equivale a identificar fonemas. No se ha implementado alineación fonética ni validado una clonación real de Samuel. Los contratos previos de cues/visemas/timestamps se conservan para una fase posterior. El tono portátil sirve para verificar audio→boca sin claves; no se incorpora como nuevo proveedor de emisión de voz.

## Estados y biblioteca

Estados visuales: `idle`, `talking`, `listening`, `thinking`, `happy`, `surprised`, `angry`, `frustrated`, `tense`, `sad`, `celebrating`. Fases: `idle`, `transitioning`, `manual-triggered`, `active`, `cooldown`, `disabled`. Puede hablar mientras celebra; tras la reacción sigue hablando si hay audio y vuelve a idle al finalizar.

El catálogo inicial tiene **25 recetas 2D**, repartidas entre `neutral`, `talking`, `happy`, `laughing`, `surprised`, `thinking`, `tense`, `frustrated`, `angry`, `sad`, `celebrating`, `celebrating_big`, `goal_against`, `penalty`, `disbelief`.

Cada `ReactionAsset` declara nombre, clasificación emocional, rango de intensidad, clip, origen, tags, duración, modos compatibles, favorito, prioridad, cooldown, estado y receta numérica. Puede vincularse a una referencia de vídeo. La selección filtra activos habilitados, listos y compatibles; respeta intensidad y cooldown por asset. Evita repetir inmediatamente la misma variante cuando tiene alternativas, también si hubo idle entre dos reacciones de la misma clase. La aleatoriedad es reproducible y pondera favoritos/prioridad. Sin aleatoriedad elige por prioridad evitando repetición. El disparo explícito de un asset por el operador permite repetirlo.

Si no hay variante disponible, busca una clase compatible (por ejemplo celebrating_big→celebrating) y después neutral; sin ninguna, mantiene reposo. Un asset `reference-only` o `placeholder` nunca se presenta como movimiento extraído: se informa del fallback y se usa una receta disponible.

## Prueba manual

1. Descarga de nuevo `downloads/SamuIA-Live-Studio.html` o ejecuta `pnpm build && pnpm start`. Comprueba **Avatar Engine v9** en la cabecera; una copia descargada antigua no se actualiza sola.
2. Abre **Avatar / Reaction Studio**. Deja `animated-2d` habilitado.
3. Escribe «GOOOOOOOL DEL CELTA!», elige emoción `celebrating`, intensidad 1 y, si quieres, estado `celebrating`. Puedes dejar estado/animación en automático.
4. Elige simulación para probar sin sonido. En el servidor puedes elegir Flite; en el portátil, voz local o audio de prueba.
5. Pulsa **SPEAK + REACT**. Observa boca, postura, asset, estado, progreso y fuente de lip-sync. Al terminar vuelve a idle.
6. **REACT ONLY** pasa por el cerebro y `VoiceController.react`, sin pedir TTS; mantiene la reacción durante la duración del asset.
7. **STOP ANIMATION** y **RESET TO IDLE** afectan al movimiento visual; no silencian una voz en curso. **Callar voz y avatar** cancela ambos.

El panel permite elegir prioridad, interrupción y override opcional de clip/asset. Las peticiones manuales respetan la protección de una intervención CRITICAL no interrumpible. Un gol/roja crítico puede interrumpir una prueba manual normal; no requiere haber configurado una voz clonada. Se conserva el comportamiento previo de las demás colas.

Los botones deportivos de este panel están habilitados en SIMULATION y pasan por los eventos del estudio y el cerebro. También siguen funcionando SIMULATION y Partido de prueba. Para probar un evento LIVE real, configura un proveedor según [datos LIVE](live-data.md), selecciona LIVE y sigue un encuentro: el mismo recorrido procesa los eventos recibidos. No hay API deportiva ni emisión pública conectada por defecto; las pruebas automáticas no certifican un partido externo en directo.

## Reaction Studio y referencias privadas

Puedes crear una reacción con nombre, tipo emocional, rango de intensidad, duración, tags, origen, favorito y vínculo opcional. Los orígenes son built-in, manual, video reference y placeholder. Una reacción manual configura una receta 2D acotada; no genera un rig nuevo. El catálogo permite probar, activar/desactivar, favorecer, priorizar y eliminar.

En **Video Reference Library**, selecciona un MP4, WebM o MOV, asigna nombre, clase, intensidad y tags, y súbelo. Puedes previsualizarlo bajo demanda en ese panel, habilitarlo/deshabilitarlo, eliminarlo y vincularlo a una reacción. El vídeo no se reproduce automáticamente ni se inserta en la preview del personaje o en la emisión.

Los vídeos quedan en `pending-motion`. El servidor verifica contenedor y metadatos con FFprobe; el navegador comprueba cabecera y metadatos reproducibles. No se hace extracción real de movimiento. `MotionReference`, `MotionProfile` y `MotionReferenceAnalyzer` preparan el puerto futuro de análisis: vídeo privado → perfil numérico → mapeo al personaje. Vincular hoy una referencia NO aplica sus gestos; el fallback se muestra expresamente. Eliminar una referencia invalida su enlace y deja el asset como placeholder deshabilitado.

Límites: 100 MiB por vídeo, 60 referencias, 1 GiB total y 150 assets. Formatos/códecs reproducibles dependen del navegador; el servidor necesita FFprobe para validar vídeos. No hay servicios de análisis remoto ni subida a plataformas.

## Persistencia y backend

| Función                                     | Servidor                            | HTML portátil           |
| ------------------------------------------- | ----------------------------------- | ----------------------- |
| Animación 2D, simulación y pruebas manuales | Sí                                  | Sí, sin Internet        |
| Ajustes y recetas                           | JSON privado                        | localStorage            |
| Referencias y sus bytes originales          | Archivos privados                   | IndexedDB               |
| Previsualización de referencia              | Lease temporal y blob local         | Blob local de IndexedDB |
| Voz local/simulación                        | Sí                                  | Sí                      |
| Flite y proveedores remotos v8              | Sí                                  | Requieren backend       |
| LIVE y emisión externa                      | Proveedores existentes configurados | No conecta directamente |

Los ajustes son `avatarEnabled`, `lipSyncEnabled`, `idleAnimationEnabled`, `blinkEnabled`, `microMotionEnabled`, `reactionRandomization`, `defaultRenderMode`, `defaultIdleStyle`, `defaultTalkStyle`, `celebrationIntensityBoost`, `reactionCooldown` y `videoReferenceEnabled`.

El servidor usa `.local/avatar-studio/library.json` y `references/`, fuera de public/dist, con directorio 0700 y archivos 0600; `AVATAR_STORAGE_DIR` permite cambiarlo. El guardado es atómico, los errores se muestran y SIMULATION/LIVE comparten configuración visual sin mezclar contextos de partido. Las referencias se almacenan con los bytes originales. El SSE contiene solo metadatos, nunca vídeos, rutas privadas ni tokens. El portátil usa `samuia-avatar-v9` y la base IndexedDB `samuia-reaction-studio-v9`; borrar datos del navegador elimina esa biblioteca local. Los partidos siguen reiniciándose al recargar.

Endpoints locales: `/api/avatar/video` (subida o lectura privada), `/api/avatar/private-session` (lease de preview), `/api/avatar/reference` (actualizar/eliminar). Los comandos visuales siguen usando `/api/command` con esquemas Zod. La lectura exige un token temporal en cabecera; no hay URLs públicas persistentes ni vídeos en el repositorio. Se mantienen las comprobaciones de origen y límites de tamaño. El backend es local por defecto: las leases de preview no sustituyen la autenticación administrativa si se expone públicamente.

## Preview, emisión y compatibilidad

`OfficialAvatarCanvas` y `VideoCompositor` usan la misma implementación `OfficialImageRenderer`, el mismo frame y las mismas calibraciones. El compositor reorganiza el programa para 16:9 y 9:16 mediante el pipeline anterior. Se preserva la posibilidad de inyectar un rig con `AvatarRendererProvider` y `renderToCanvas`. Los adaptadores de plataformas, encoder, audio capturable, chats y reconciliación de reproducción no se sustituyen. Esta entrega prueba salida local, sin abrir directos públicos ni incorporar imagen/audio del partido.

## Archivos

Nuevos:

- `packages/avatar-engine/{package.json,src/contracts.ts,src/index.ts,src/schemas.ts}`: estados, selección y validación.
- `apps/studio/src/{OfficialImageRenderer.ts,OfficialAvatarCanvas.tsx}`: renderer compartido y vista React.
- `apps/studio/src/{ReactionStudio.tsx,reaction-references.ts,avatar-persistence.ts,test-tone-voice.ts}`: panel, almacenamiento y prueba local.
- `apps/server/src/reaction-studio.ts`: persistencia privada, validación y referencias.
- `tests/avatar-engine.test.ts`, `tests/e2e/avatar-engine.spec.ts`, `tests/fixtures/reference-video.ts`: cobertura añadida.
- Esta guía.

Modificados:

- `packages/avatar-animation/src/index.ts`: amplía el controlador existente.
- `packages/{voice/src/contracts.ts,voice/src/index.ts,core/src/index.ts,samuia-brain/src/index.ts}`: metadatos, reacción sin audio, integración y prioridad.
- `packages/shared/src/{avatar.ts,index.ts}`: snapshots, ajustes y comandos.
- `apps/server/src/{commands.ts,server.ts}`: validación, rutas y persistencia.
- `apps/studio/src/{App.tsx,Avatar.tsx,AvatarRendererHost.tsx,AvatarSimulation.tsx,VideoCompositor.ts,style.css}` y `standalone.html`: UI y salida existentes.
- `.env.example`, `AGENTS.md`, `pnpm-lock.yaml`, README y guías de avatar/voz/emisión; HTML entregable y etiqueta de edición en la prueba anterior.

## Validación y siguientes fases

Ejecuta `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` y `CI=1 CHROMIUM_PATH=/usr/bin/chromium pnpm test:e2e`.

Las pruebas nuevas verifican estados, idle→talking→idle, biblioteca/no repetición/cooldown/fallback, amplitud/progreso, cancelaciones y callbacks obsoletos, reacción manual sin audio, parada/reset, persistencia, privacidad y enlace/eliminación de vídeo. En Chromium comparan píxeles reales: la boca cambia y fondo/escritorio/micrófono permanecen iguales; ejercitan Flite con RMS medido, prueba portátil sin red y conservación de vídeos en IndexedDB. El build verifica hashes de originales y sus copias. Se conserva la suite anterior, incluida la salida local codificada. CI comprueba reproducción y amplitud, no escucha física de altavoces.

El build advierte del tamaño del bundle principal (algo más de 500 kB minificado); no impide generar servidor, frontend y HTML portátil. No se ha ocultado la advertencia.

Para mayor fidelidad hacen falta capas/máscaras y un rig facial aprobado del mismo personaje, más vistas oficiales para nuevas poses/expresiones y calibración de oclusiones. Para copiar gestos de referencias hace falta implementar y validar un extractor de puntos/perfil de movimiento con su mapeo al rig, incluyendo límites y privacidad. Para visemas reales hace falta alineación fonética del audio con timestamps. Nada de eso se presenta como mocap, clonación facial o animación 3D ya terminada.

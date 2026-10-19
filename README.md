# SamuIA Live Studio · 0.2

Estudio local de un streamer futbolero con personalidad configurable y memoria por partido. TypeScript + React + Node.js + pnpm, con cuatro encuentros simultáneos, chat, radar, cola de reacciones y director visual. **Datos, respuestas, avatar y voz son simulados. No se conecta ninguna API externa.**

Esta versión reconstruye el MVP descrito en la conversación y añade la personalidad con memoria. No es una recuperación binaria del archivo anterior.

## Abrir sin instalar nada

Descarga **[downloads/SamuIA-Live-Studio.html](downloads/SamuIA-Live-Studio.html)** y abre el archivo guardado con un navegador moderno. Contiene React, estilos y los mismos motores dentro de un único HTML; no necesita servidor ni Internet. En GitHub, usa el botón de descargar el archivo: la vista del código HTML no es la aplicación.

**Para actualizar una copia anterior:** vuelve a descargar el HTML; el archivo guardado en tu ordenador no se actualiza al cambiar GitHub. Guárdalo como `SamuIA-escenas-v1.html` y abre ese archivo nuevo. Esta edición muestra **«Escenas oficiales v1»** arriba, incluye los cinco fondos originales y permite elegirlos en **Ajustes → Escenario del comentarista → Setup principal**. Ocupa unos 36 MiB. Si no ves ese indicador, estás abriendo otra edición.

Cada pestaña tiene su propia sesión. **Recargar el HTML restaura la demo inicial**. Puedes exportar los datos de memoria como JSON desde Memoria (es una exportación para consulta, no un importador de sesiones). La voz es un temporizador sin audio. El avatar usa las cinco fotografías originales oficiales; los fondos siguen siendo escenarios de demostración.

## Desarrollo

Requisitos: Node.js >=22 y pnpm **10.11.0**. Desde la raíz:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Vite usa el puerto **5173** y redirige `/api` a Node en **3001**. El terminal muestra la dirección local para abrir en tu equipo. Este onboarding de ChatGPT no ofrece una vista previa alojada ni publica el servidor en Internet.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
CHROMIUM_PATH=/usr/bin/chromium pnpm test:e2e
pnpm start
```

`build` compila UI, backend y HTML portátil. `start` sirve la UI compilada y la API en 3001. Ejecuta los comandos desde la raíz. Si no existe Chromium del sistema, ejecuta `pnpm exec playwright install chromium` y omite `CHROMIUM_PATH` en las pruebas. El E2E necesita `pnpm build` antes de arrancar.

Para generar solo el HTML: `pnpm build:portable`; salida en `.local/SamuIA-Live-Studio.html`. También actualiza `downloads/SamuIA-Live-Studio.html`, la copia versionada que se entrega junto con el código.

### Entorno cloud con permisos limitados

Usa el checkout existente; las tareas ya están aisladas y no necesitan un Git worktree.

```sh
export COREPACK_HOME=/workspace/.cache/corepack
export XDG_DATA_HOME=/workspace/.cache/data
export XDG_CACHE_HOME=/workspace/.cache
cd /workspace/SamuIA
corepack pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm-store
corepack pnpm dev
```

`corepack pnpm` sustituye a `pnpm` si no está activado. `.env.example` contiene solo HOST y PORT, sin claves. Node no carga `.env` automáticamente: exporta variables o usa `node --env-file=.env apps/server/dist/index.js`. El backend escucha en loopback por defecto; requiere autenticación y revisión adicional antes de exponerlo como servicio público.

## Recorrido del MVP

1. Celta–Madrid está fijado como partido principal. **Gol Celta** actualiza el resultado, las probabilidades y el radar. SamuIA celebra, energía 100 y primer plano, y después regresa a fútbol y plano streamer.
2. En Centro de Partidos selecciona Arsenal en Liverpool–Arsenal y pulsa Roja. Recibe una alerta secundaria; la reacción espera a que termine la frase actual y después vuelve al principal.
3. Añade un comentario «¿Cómo va el Liverpool?» y pulsa Responder. Consulta ese encuentro, no el principal. «¿Cuál está más interesante?» consulta todos los partidos seguidos.
4. Añade o elimina partidos y competiciones. Activa seguimiento, pausa reacciones, prioridades y filtros por encuentro. Amarillas y cambios no generan reacciones por defecto.
5. Quita el principal y activa Modo carrusel en Ajustes. Cambia por relevancia, eventos recientes, prioridad, favoritos y tiempo desde la visita; no rota por tiempo únicamente. Las preguntas sobre otro partido lo enfocan temporalmente.
6. El reloj avanza **un minuto simulado cada 15 segundos reales**, hasta 95. Descanso y Final son manuales; reanuda la segunda parte con su botón. Finalizados y próximos no avanzan.
7. **Callar** cancela explícitamente; los eventos y otros controles esperan a terminar la frase. El chat se responde manualmente. El comentario editorial automático tiene su propia frecuencia y comparte los límites de intervenciones.

Los datos se mantienen en memoria del proceso de Node o de la pestaña portátil. Reiniciar el servidor restaura los cuatro encuentros. Varias pestañas conectadas al backend comparten el mismo estudio. El panel muestra DEMO u OFFLINE; LIVE queda para futuras integraciones.

## Personalidad con memoria

`LiveMatchContextService` mantiene un `LiveMatchContext` independiente por partido. `CommentaryEngine` consulta ese contexto antes de proponer una reacción, opinión, pregunta o predicción. `ReactionDirector` publica la decisión y confirma las escrituras de memoria **cuando empieza su turno**, no cuando se encola un estímulo.

Cada `personalityMemory` contiene:

- `previousOpinions`: valoración de ocasiones por xG simulado; al cambiar de equipo destacado reconoce la opinión anterior.
- `predictions`, `successfulPredictions`, `failedPredictions`: predicciones publicadas del próximo gol, con objetivo, marcador base, plazo, confianza editorial, estado e ID del evento o reloj que las resuelve.
- `communityQuestions`, `communityResponses`: preguntas publicadas y mensajes reales del simulador, enlazados por ID.
- `runningJokes`: bromas ya utilizadas para evitar repetirlas constantemente.
- `memorableMoments`: eventos deportivos realmente registrados en esta sesión.
- `playersPraised`, `playersCriticized`: interfaces reservadas. Permanecen vacías porque el mock no tiene estadísticas de jugadores; no inventa nombres, pérdidas de balón ni acciones por una banda.

Cada entrada incluye ID, timestamp, minuto, contenido, jugador/equipo relacionado o null, IDs de fuentes y confianza cuando corresponde. Las colecciones están acotadas: no es una memoria ilimitada ni una base de datos histórica. La vista Memoria permite inspeccionar los datos de respaldo y exportarlos.

### Predicciones honestas

Para mojarse necesita dos ocasiones registradas en los últimos diez minutos, encuentro en directo y minuto <90. Una predicción vence a los quince minutos de partido o al minuto 95. Un gol posterior del lado previsto la confirma; un gol del rival, el final sin cumplirse o el vencimiento la marca fallida. Si aún hay una predicción pendiente, no la sustituye para apropiarse del acierto.

«Os lo dije» exige un ID de predicción publicada y acertada del mismo encuentro. La capa de memoria rechaza referencias inexistentes o de otro partido. Una predicción fallida se reconoce en su reacción o en el siguiente análisis. La confianza del 55% es un marcador editorial simulado, no una probabilidad calibrada.

### Comunidad y neutralidad

Las preguntas son de respuesta sí/no. Solo cuenta mensajes posteriores a la pregunta y no silenciados, en su contexto. Cada nombre de usuario cuenta una vez, con su última respuesta; se normalizan mayúsculas y acentos. Los porcentajes requieren **tres participantes distintos como mínimo**, y siempre se muestra el numerador y el denominador. No afirma haber leído mensajes que no existen.

La afinidad del canal se configura explícitamente por partido en Ajustes; no se inventa una mayoría de aficionados. Puede mostrar complicidad y reconoce el xG superior del rival. Favoritos y afinidad nunca alteran estadísticas ni probabilidades. El picante usa bromas futboleras ligeras, no ataques a personas o aficiones. Modo seguro empieza activado; el respeto se mantiene en todos los modos.

### Perfil editable

`AICommentatorProfile` define nombre, avatar, descripción, estilo, expresiones propias/prohibidas, humor, emoción, picante, frecuencia de predicciones, emojis, preguntas, comentarios, toque gallego y longitud. El panel admite reglas de emoción/picante por equipo o liga, y afinidad por partido. Descripción y estilo libre son metadatos para futuros proveedores; el motor determinista usa plantillas variadas y los controles concretos, no interpreta instrucciones de lenguaje natural.

La intensidad 1–5 depende del contexto: tranquilo, activo, intenso, decisivo y locura. Un gol que rompe o iguala un partido en el tramo final tiene intensidad 5; gol, ocasión, penalti o roja tienen al menos 4. Derbi/final aportan tensión editorial sin cambiar datos.

## Arquitectura

```text
apps/studio/             React, dashboard, partidos, radar, chat, memoria, ajustes
apps/server/             HTTP Node, validación Zod, SSE y UI compilada
packages/shared/         Tipos, comandos, perfiles, eventos y constantes
packages/football-engine/ MatchManager, estadísticas, probabilidades y radar
packages/chat-engine/    ChatQueue, prioridad, temas y referencias de equipos
packages/samuia-brain/   CommentaryEngine, LiveMatchContextService y SamuIABrain
packages/core/           ReactionDirector, scheduler, cámara, escenas y voz mock
packages/obs-controller/ Contrato y mock de OBS
integrations/            Contratos y mocks OpenAI, deportes, Twitch, YouTube, TikTok
assets/                  Referencias y assets fuente futuros
downloads/               HTML portátil entregado
scripts/portable.mjs     Empaquetado autónomo sin solicitudes externas
tests/                   Pruebas de dominio, API y navegador
```

`ReactionDecision` tiene exactamente `say`, `scene`, `emotion`, `camera`, `gesture`, `energy`. Solo `say` corresponde a lo hablado. Cámara, escena, expresión y gesto son instrucciones independientes. La cámara efectiva puede mantener su encuadre mientras respeta cooldown.

`ReactionDirector`: IDLE → THINKING → SPEAKING/REACTING → COOLDOWN. Una respuesta seleccionada mientras habla queda reservada; nunca se marca respondida antes de su propia reproducción. La voz mock dura entre 1,8 y 18 segundos. Integrar audio real exige sustituir ese temporizador por señales de reproducción/finalización, conservando el arbitraje de turnos.

`sportsEventQueue` puntúa gol 100; penalti/roja 90; VAR 80; ocasión/final 60; descanso 30; amarilla 20; cambio 10. Añade prioridad, importancia de competición y favoritos; reduce el peso si acaba de reaccionar a ese partido. Agrupa menores del mismo encuentro en 15 s y espera 3 s para reunirlos. Menores caducan a los 20 s; importantes a los 180 s. Cola máxima 100, ordenada por puntuación y antigüedad. Hay cooldown y límite por minuto. Las alertas tienen una lista separada con su estado de resolución.

## Estadísticas, probabilidades y radar

Las estimaciones son deterministas: modelo Poisson de goles restantes con marcador, minuto, localía genérica y expulsiones. No incorpora fuerza real de los equipos. Al finalizar representa el resultado conocido. xG y posesión se actualizan mediante reglas artificiales de los eventos mock. El radar considera igualdad, goles, minuto, tiros a puerta, xG, actividad reciente, posible remontada, importancia y prioridad. Ambos están separados de la afinidad editorial.

**Estimación informativa. No es consejo de apuesta.** No hay apuestas, promesas de beneficio ni datos deportivos reales en esta fase.

## Assets y proveedores futuros

La identidad oficial del personaje está definida en [assets/reference/README.md](assets/reference/README.md) y [su manifiesto](assets/reference/identity.json), a partir de los cinco retratos del mismo personaje aportados por el usuario. Debe mantenerse en todas las expresiones y cámaras. Los cinco PNG y sus ZIP están archivados con huellas SHA-256. La aplicación y el HTML portátil muestran las imágenes originales; el SVG provisional ha sido retirado.

Avatar: `apps/studio/public/samuia/avatar/` contiene copias exactas de `avatar_cara_01.png` (sonrisa), `02` (pensativo), `03` (neutral), `04` (habla) y `05` (serio). Los ZIP sin cambios y los PNG originales se conservan en `assets/reference/archives/` y `assets/reference/originals/`; sus hashes están en `originals-index.json`. El selector de Ajustes solo admite esas cinco vistas del mismo personaje o el modo automático. Las expresiones ausentes usan una referencia disponible, sin crear imágenes nuevas. Las cámaras usan encuadres del mismo retrato y mantienen sus proporciones; no modifican sus bytes.

El HTML portátil incorpora las cinco imágenes completas en base64 y el build comprueba su igualdad con los originales. Puede ocupar unos 16 MB porque no se comprimen ni redimensionan los PNG.

Escenas: `public/samuia/scenes/` con `chat.png`, `football.png`, `gaming.png`, `tech.png`, `angry-red.png`, `celebration.png`. Mapeos en `core/src/visual.ts`. El avatar mantiene proporciones con contain; el fondo usa cover. Cambiar escena no reinicia el avatar. Hay transiciones y soporte de movimiento reducido. La distribución portátil no descarga imágenes externas: los cinco originales están incluidos en el archivo.

Para proveedores reales, implementa `ChatProvider`, `SportsDataProvider`, `BrainProvider`, `VoiceProvider` o `OBSController` y compónlos en el backend. Los mocks de chat tienen buzón y envío, deportes incluye ligas/partidos/estadísticas/eventos/suscripciones, OBS registra comandos sin conectarse. `MockOpenAIProvider` es una interfaz demostrativa; la aplicación usa su cerebro local.

Un futuro LLM debe validar ReactionDecision, consultar memoria y aportar referencias verificables; no basta con pedirle que «recuerde». Los datos deportivos deben proceder de feeds autorizados/licenciados, sin scraping. Credenciales solo en backend, nunca con prefijos públicos del frontend.

Añade competiciones desde Centro de Partidos o desde un proveedor que entregue `League`. Para nuevos eventos amplía `eventTypes`, mapas de etiquetas/pesos, estadísticas, comentarios y pruebas; TypeScript señala los mapas incompletos.

## Validación y conservación

Las pruebas cubren gestor, probabilidades, radar, carrusel, chat, scheduler, director, cámara, memoria, aciertos/fallos, cambios de opinión, aislamiento por partido, votos únicos, API y SSE. El navegador prueba la UI compilada y el HTML autónomo con red desactivada. El Chromium administrado de este entorno bloquea `file://`; el test portátil entrega únicamente el documento desde memoria en un origen local simulado, sin backend y sin solicitudes de red posteriores.

API: GET `/api/health`, `/api/state`, `/api/events` (SSE); POST `/api/command` (JSON, máximo 16 KiB). Comandos y esquemas en shared y server. Errores visibles en UI; SSE reconecta.

Guarda el código con Git y envíalo al repositorio remoto; los archivos temporales y procesos cloud pueden desaparecer. La instantánea de entorno se conserva mediante revisión y publicación en sus ajustes, pero no sustituye al repositorio. Conserva también una copia descargada del HTML o del ZIP de código. Nunca consideres una ruta `/workspace/...` una copia permanente.

### Setup del comentarista

En **Ajustes → Escenario del comentarista** puedes elegir entre las cinco escenas originales, usar cambios automáticos según la escena y activar los gráficos del partido o la iluminación reactiva. La base principal es la referencia 05: madera, doble monitor, micrófono de brazo, plantas, recuerdos futbolísticos gallegos y luz azul/cálida. El marcador, el minuto y la competición siguen el partido en foco; la decoración fotografiada permanece fija. El avatar usa los retratos oficiales intactos en un panel central. Las cinco escenas también están incluidas en el HTML sin conexión. Consulta el [análisis y archivo de referencias](assets/reference/scenes/README.md).

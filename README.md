# SamuIA Live Studio · 0.2

Estudio local de un streamer futbolero con personalidad configurable y memoria por partido. TypeScript + React + Node.js + pnpm, con cuatro encuentros simultáneos, chat, radar, cola de reacciones y director visual. **SIMULATION funciona sin claves. LIVE admite datos normalizados mediante HTTP JSON o API-Football, con configuración privada en el servidor. Comentarios del motor local, avatar oficial como fallback estático y voz desacoplada.**

Esta versión reconstruye el MVP descrito en la conversación y añade la personalidad con memoria. No es una recuperación binaria del archivo anterior.

## Abrir sin instalar nada

Descarga **[downloads/SamuIA-Live-Studio.html](downloads/SamuIA-Live-Studio.html)** y abre el archivo guardado con un navegador moderno. Contiene React, estilos y los mismos motores dentro de un único HTML; no necesita servidor ni Internet. En GitHub, usa el botón de descargar el archivo: la vista del código HTML no es la aplicación.

**Para actualizar una copia anterior:** vuelve a descargar el HTML; el archivo guardado en tu ordenador no se actualiza al cambiar GitHub. Guárdalo como `SamuIA-multiplataforma-v7.html` y abre ese archivo nuevo. Esta edición muestra **«Multiplataforma v7»** arriba, incluye los cinco fondos originales y permite elegirlos en **Ajustes → Escenario del comentarista → Setup principal**. Incluye cinco composiciones con personaje y habitación unidos en una imagen por escena, sin marco ni fondo blanco. Si no ves ese indicador, estás abriendo otra edición.

Cada pestaña tiene su propia sesión. **Recargar el HTML restaura la demo inicial**. Puedes exportar los datos de memoria como JSON desde Memoria (es una exportación para consulta, no un importador de sesiones). La voz predeterminada es simulada sin audio; en Partido de prueba se puede seleccionar TTS local del navegador. El avatar usa las cinco fotografías originales oficiales; los fondos siguen siendo escenarios de demostración.

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

`corepack pnpm` sustituye a `pnpm` si no está activado. `.env.example` incluye HOST, PORT y las opciones LIVE, sin claves reales. Copia el ejemplo a `.env`: el punto de entrada del servidor lo carga automáticamente en Node 22+. También puedes exportar las variables del entorno. El backend escucha en loopback por defecto; requiere autenticación y revisión adicional antes de exponerlo como servicio público.

## Recorrido del MVP

1. Celta–Madrid está fijado como partido principal. **Gol Celta** actualiza el resultado, las probabilidades y el radar. SamuIA celebra, energía 100 y primer plano, y después regresa a fútbol y plano streamer.
2. En Centro de Partidos selecciona Arsenal en Liverpool–Arsenal y pulsa Roja. Recibe una alerta secundaria; la reacción espera a que termine la frase actual y después vuelve al principal.
3. Añade un comentario «¿Cómo va el Liverpool?» y pulsa Responder. Consulta ese encuentro, no el principal. «¿Cuál está más interesante?» consulta todos los partidos seguidos.
4. Añade o elimina partidos y competiciones. Activa seguimiento, pausa reacciones, prioridades y filtros por encuentro. Amarillas y cambios no generan reacciones por defecto.
5. Quita el principal y activa Modo carrusel en Ajustes. Cambia por relevancia, eventos recientes, prioridad, favoritos y tiempo desde la visita; no rota por tiempo únicamente. Las preguntas sobre otro partido lo enfocan temporalmente.
6. En SIMULATION el reloj avanza **un minuto simulado cada 15 segundos reales**, hasta 95. Descanso y Final son manuales; reanuda la segunda parte con su botón. Finalizados y próximos no avanzan.
7. **Callar** cancela explícitamente; los eventos y otros controles esperan a terminar la frase. El chat se responde manualmente. El comentario editorial automático tiene su propia frecuencia y comparte los límites de intervenciones.

Los datos se mantienen en memoria del proceso de Node o de la pestaña portátil. Reiniciar el servidor restaura los cuatro encuentros. Varias pestañas conectadas al backend comparten el mismo estudio. El panel muestra SIMULATION o LIVE y el estado de conexión. LIVE requiere configurar un proveedor en el servidor; los datos de cada modo se conservan separados al alternar.

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
packages/core/           ReactionDirector, scheduler, cámara y escenas
packages/voice/          VoiceController y contrato TTS; proveedor simulado
packages/live-data/      Contratos, normalización, deduplicación y sesión LIVE
packages/obs-controller/ Contrato y mock de OBS
integrations/            Contratos y mocks OpenAI, deportes, Twitch, YouTube, TikTok
assets/                  Referencias y assets fuente futuros
downloads/               HTML portátil entregado
scripts/portable.mjs     Empaquetado autónomo sin solicitudes externas
tests/                   Pruebas de dominio, API y navegador
```

`ReactionDecision` contiene `say`, `scene`, `emotion`, `camera`, `gesture`, `energy` y la directiva independiente `avatar`. Solo `say` corresponde a lo hablado. Cámara, escena, expresión y gesto son instrucciones independientes. La cámara efectiva puede mantener su encuadre mientras respeta cooldown.

`ReactionDirector`: IDLE → THINKING → SPEAKING/REACTING → COOLDOWN. Una respuesta seleccionada mientras habla queda reservada; nunca se marca respondida antes de su propia reproducción. La voz mock dura entre 1,8 y 18 segundos. El nuevo `VoiceController` conserva el arbitraje de turnos con inicio, pausa, reanudación, final y cancelación del proveedor; el audio real espera a sus callbacks en vez de terminar por duración estimada.

`sportsEventQueue` puntúa gol 100; penalti/roja 90; VAR 80; ocasión/final 60; descanso 30; amarilla 20; cambio 10. Añade prioridad, importancia de competición y favoritos; reduce el peso si acaba de reaccionar a ese partido. Agrupa menores del mismo encuentro en 15 s y espera 3 s para reunirlos. Menores caducan a los 20 s; importantes a los 180 s. Cola máxima 100, ordenada por puntuación y antigüedad. Hay cooldown y límite por minuto. Las alertas tienen una lista separada con su estado de resolución.

## Estadísticas, probabilidades y radar

Las estimaciones son deterministas: modelo Poisson de goles restantes con marcador, minuto, localía genérica y expulsiones. No incorpora fuerza real de los equipos. Al finalizar representa el resultado conocido. xG y posesión se actualizan mediante reglas artificiales de los eventos mock. El radar considera igualdad, goles, minuto, tiros a puerta, xG, actividad reciente, posible remontada, importancia y prioridad. Ambos están separados de la afinidad editorial.

**Estimación informativa. No es consejo de apuesta.** No hay apuestas, promesas de beneficio ni datos deportivos reales en esta fase.

## Assets y proveedores futuros

La identidad oficial del personaje está definida en [assets/reference/README.md](assets/reference/README.md) y [su manifiesto](assets/reference/identity.json), a partir de los cinco retratos del mismo personaje aportados por el usuario. Debe mantenerse en todas las expresiones y cámaras. Los cinco PNG y sus ZIP están archivados con huellas SHA-256. La aplicación y el HTML portátil muestran las imágenes originales; el SVG provisional ha sido retirado.

Avatar: `apps/studio/public/samuia/avatar/` contiene copias exactas de `avatar_cara_01.png` (sonrisa), `02` (pensativo), `03` (neutral), `04` (habla) y `05` (serio). Los ZIP sin cambios y los PNG originales se conservan en `assets/reference/archives/` y `assets/reference/originals/`; sus hashes están en `originals-index.json`. El selector de Ajustes solo admite esas cinco vistas del mismo personaje o el modo automático. Las expresiones ausentes usan una referencia disponible, sin crear imágenes nuevas. Las cámaras usan encuadres del mismo retrato y mantienen sus proporciones; no modifican sus bytes.

El HTML portátil incorpora las cinco imágenes completas en base64 y el build comprueba su igualdad con los originales. Puede ocupar unos 16 MB porque no se comprimen ni redimensionan los PNG.

Escenas: `apps/studio/public/samuia/scenes/` contiene los cinco fondos originales `escena_01.png` a `05.png` y las cinco composiciones `samuia_setup_01.png` a `05.png`. Mapeos en `packages/core/src/scenery.ts`. El modo integrado muestra personaje y habitación en un PNG con pose fija; el modo de retratos conserva las proporciones y transparencia del original. Los datos del partido y la iluminación son capas dinámicas. El HTML portátil incluye los diez originales y las cinco composiciones sin solicitudes externas.

Para otros proveedores de fútbol, implementa `MatchDataProvider` y, si hay narración, `LiveCommentaryProvider`; el contrato común evita cambios en el cerebro y la UI. `CommunityCommentProvider` procesa los mensajes de la app. Los contratos anteriores de redes, cerebro, voz y OBS siguen disponibles. Los mocks de chat tienen buzón y envío, deportes incluye ligas/partidos/estadísticas/eventos/suscripciones, OBS registra comandos sin conectarse. `MockOpenAIProvider` es una interfaz demostrativa; la aplicación usa su cerebro local.

Un futuro LLM debe validar ReactionDecision, consultar memoria y aportar referencias verificables; no basta con pedirle que «recuerde». Los datos deportivos deben proceder de feeds autorizados/licenciados, sin scraping. Credenciales solo en backend, nunca con prefijos públicos del frontend.

Añade competiciones desde Centro de Partidos o desde un proveedor que entregue `League`. Para nuevos eventos amplía `eventTypes`, mapas de etiquetas/pesos, estadísticas, comentarios y pruebas; TypeScript señala los mapas incompletos.

## Validación y conservación

Las pruebas cubren gestor, probabilidades, radar, carrusel, chat, scheduler, director, cámara, memoria, aciertos/fallos, cambios de opinión, aislamiento por partido, votos únicos, API y SSE. El navegador prueba la UI compilada y el HTML autónomo con red desactivada. El Chromium administrado de este entorno bloquea `file://`; el test portátil entrega únicamente el documento desde memoria en un origen local simulado, sin backend y sin solicitudes de red posteriores.

API: GET `/api/health`, `/api/state`, `/api/events` (SSE); POST `/api/command` (JSON, máximo 16 KiB). Comandos y esquemas en shared y server. Errores visibles en UI; SSE reconecta.

Guarda el código con Git y envíalo al repositorio remoto; los archivos temporales y procesos cloud pueden desaparecer. La instantánea de entorno se conserva mediante revisión y publicación en sus ajustes, pero no sustituye al repositorio. Conserva también una copia descargada del HTML o del ZIP de código. Nunca consideres una ruta `/workspace/...` una copia permanente.

### Setup del comentarista

En **Ajustes → Escenario del comentarista** puedes elegir entre las cinco escenas originales, usar cambios automáticos según la escena y activar los gráficos del partido o la iluminación reactiva. La base principal es la referencia 05: madera, doble monitor, micrófono de brazo, plantas, recuerdos futbolísticos gallegos y luz azul/cálida. El marcador, el minuto y la competición siguen el partido en foco; la decoración fotografiada permanece fija. El avatar y la habitación están integrados en un único PNG por escena, con pose neutra fija. Los retratos originales siguen disponibles en un visor de referencia separado, sin superponerlos a la habitación. Las cinco escenas también están incluidas en el HTML sin conexión. Consulta el [análisis y archivo de referencias](assets/reference/scenes/README.md).

### Avatar animado · arquitectura y simulación

Abre **SIMULATION** para probar los 13 estados de animación, mirada, intensidad, texto hablado y señales de cabeza, cuerpo, parpadeo y boca. Los eventos del CommentaryEngine envían texto, emoción e instrucciones de animación al **AvatarAnimationController**, independiente del renderer y de las imágenes.

Las imágenes actuales son fallbacks visuales; todavía no hay rig 2D/3D ni voz real. La sincronización de boca se simula por texto y puede sustituirse por visemas con tiempos de audio. El host permite inyectar un renderer de avatar sin cambiar el motor editorial. Consulta [el contrato y la integración](docs/avatar-animation.md).

La edición v3.1 conserva el encuadre completo de los escenarios, usa la misma presentación en Dashboard y SIMULATION y elimina el balanceo de fotografías. Los retratos originales tienen un visor de referencia separado para evitar tapar el mobiliario con un montaje incorrecto.

### Partido de prueba end-to-end

Abre **Partido de prueba → Reproducir partido completo**. El guion local de 24 pasos recorre un Celta–Dépor desde el inicio hasta el final 2–1, con comentarios, comunidad, tarjetas, VAR, penalti, cambios, descanso y predicciones verificadas (una acertada y otra fallida). Puedes pausar, avanzar paso a paso, escribir mensajes y usar controles manuales. No altera los partidos del estudio ni necesita API externa. Los PNG son referencias estáticas; el panel de voz permite simular o usar una voz local instalada, pausar, reanudar y silenciar. El diagnóstico muestra todo el flujo y los errores de reproducción. Consulta [el contrato TTS desacoplado](docs/voz.md). Consulta [el recorrido y la arquitectura reutilizada](docs/partido-prueba.md).

## Datos reales · LIVE

El selector **Modo de datos** alterna entre SIMULATION y LIVE. Configura `.env` siguiendo [la guía de proveedores LIVE](docs/live-data.md); `.env.example` incluye las variables sin credenciales. LIVE combina datos, eventos, narración opcional y comunidad con el CommentaryEngine existente, e incorpora deduplicación, reconexión y fallback. El HTML portátil mantiene SIMULATION completo y muestra el diagnóstico de LIVE; la conexión real requiere el servidor para proteger las claves.

## Chats y retransmisión multiplataforma

Abre **Multiplataforma** para configurar de forma independiente los chats y las salidas de YouTube, Twitch, Kick y TikTok. Hay previsualizaciones 16:9/9:16 y una **Prueba local codificada** que usa FFmpeg sin abrir destinos públicos. Los chats entran al CommunityAnalyzer y al cerebro existente con filtros, identidad y contexto. [Configuración, permisos y límites](docs/multiplataforma.md).

Las emisiones usan únicamente el programa propio de SamuIA. El avatar sigue como fallback estático hasta conectar un renderer con rig; la salida admite sus frames y lip-sync sin cambiar el pipeline. El audio capturable puede probarse con `BROADCAST_TTS=flite` (voz local de prueba). Las claves y tokens se configuran solo en `.env` del servidor. El HTML portátil conserva la simulación y las dos previsualizaciones; las plataformas externas requieren el backend.

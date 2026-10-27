# Arquitectura compartida · primera etapa

Esta etapa simplifica la coordinación existente sin introducir nuevos servicios
ni cambiar los comandos HTTP, las instantáneas o la navegación.

## Responsabilidades y arquitectura objetivo

| Responsabilidad objetivo | Implementación actual que se aprovecha |
| --- | --- |
| SourceManager | Proveedores y configuración LIVE; ExternalChatManager; entradas simuladas |
| EventHub | Entradas de ReactionDirector: command, receiveExternalChat, applyLiveMatch y receiveLiveIncident |
| SamuIABrain | SamuIABrain y memoria verificable existente |
| ContentGenerator | CommentaryEngine, SamuIABrain.respond, operator y control |
| BroadcastQueue | Cola deportiva y controles del director; admisión común de respuestas automáticas |
| PresentationDirector | ReactionDirector, VoiceController, AvatarAnimationController y selección de escenas |
| OutputManager | VideoCompositor, BroadcastProducer y BroadcastOutputManager |

La tabla asigna responsabilidades; no declara siete servicios implementados.
Las colas deportiva, de controles y de voz todavía no son una cola universal.
El transporte de chat y los búferes multimedia conservan su propia función.

## Cambios de esta etapa

- `ReactionDirector.readyForIntervention` concentra la disponibilidad del turno:
  estado IDLE, sin respuesta reservada, selección de chat, eventos deportivos o
  controles pendientes.
- `respondToPendingChat` selecciona y reserva mediante el comando `respond`
  existente. No marca contestado un mensaje antes de terminar su intervención.
  También rechaza respuestas automáticas cuando los datos LIVE están caducados.
- El servidor conserva la selección por prioridad de mensajes externos con
  prioridad mínima 30. LIVE conserva el orden de llegada. Ambos conservan la
  activación mediante `communityInteractionLevel`.
- Partido de prueba reutiliza la misma admisión, conserva la selección por
  prioridad y su propio interruptor `autoReply`, independiente de la frecuencia
  del perfil. Sigue utilizando una instancia aislada del mismo director.
- `SamuIABrain.control` produce los borradores de enfado, celebración y retorno
  normal. El director conserva su cola, sus límites y la cancelación por silencio.
  Los textos, escenas, energía y comandos anteriores permanecen compatibles.
- Multiplataforma usa el mismo helper `toggle` para chats y salidas, incluyendo
  estado visual inmediato, envío del comando y limpieza del estado provisional.
  El chat antes repetía el envío sin aplicar ese estado, de modo que una
  casilla controlada podía desmarcarse mientras esperaba la respuesta del servidor.

La comprobación de frescura es común: antes el servidor podía reservar mensajes
externos pendientes aunque LIVE hubiera rechazado responder por datos caducados.
Se conservan pendientes hasta recuperar datos actuales. Esta regla afecta a la
respuesta automática; no cambia los comandos manuales.

## Garantías de conservación

- Mantener personalidad, memoria por partido, fuentes e historial.
- Conservar prioridades deportivas, pausas, silenciamiento y cancelación.
- Conservar Voice Studio, proveedores, controladores de voz y avatar, recetas,
  escenas, originales y renderer compartido de estudio/emisión.
- Conservar SIMULATION sin claves, ensayo guiado, HTML portátil y aislamiento LIVE.
- Conservar las integraciones y las salidas independientes por plataforma/formato.

## Verificación

Desde la raíz: `pnpm lint`, `pnpm typecheck`, `pnpm test`, compilación de UI,
servidor y portátil, y `CHROMIUM_PATH=/usr/bin/chromium pnpm test:e2e`.
Las pruebas añadidas en `tests/director.test.ts` verifican reserva única y fin de
respuesta, políticas de selección, filtrado externo, frescura LIVE y precedencia
de eventos deportivos. Las suites existentes cubren el resto de los recorridos.
El ensayo completo de navegador usa el reloj controlado de Playwright: conserva
las comprobaciones de los 24 pasos y la espera de agrupación de eventos menores,
sin depender de que una aserción alcance una reacción breve antes del paso siguiente.
La prueba de administración retiene la petición del chat y comprueba la casilla
antes de liberar la respuesta, para detectar regresiones del estado provisional.

Durante onboarding, usar el script de instalación guardado para compilar: genera
el portátil en una copia temporal y conserva el HTML actualizado en `.local/`,
sin reescribir la entrega versionada de `downloads/`.

## Siguiente etapa

Unificar progresivamente el arbitraje editorial de las colas y compartir la
reproducción de audio entre escucha y emisión, conservando permisos y destinos.
Después separar modalidad, procedencia de datos y presentación; introducir
contextos generales y simplificar los menús. Noticias, escaletas, programación
automática, nuevas fuentes y movimientos definitivos no se implementan aquí.

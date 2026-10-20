# Voz desacoplada · Voice Studio v8

`ReactionDirector → VoiceController → VoiceProvider → reproducción`

El mismo `CommentaryEngine` genera texto, emoción, energía y directiva de avatar. El director publica el comentario con sus fuentes y memoria, crea un ID de frase e inicia a la vez el controlador de avatar y el de voz. No hay un motor alternativo de comentarios; los datos LIVE y chats entran por sus proveedores independientes.

## Proveedores y contrato

`packages/voice/src/index.ts` no depende del DOM, SDK de audio ni nombres de imágenes. `VoiceProvider` declara nombre, capacidad audible, estimación de duración y `play(request, events, now)`. Recibe ID, texto, emoción, energía y duración estimada. Devuelve `cancel`, `pause` y `resume`; comunica `started`, `timing`, `ended` o `failed`.

- `SimulatedVoiceProvider`: reloj determinista conducido por `tick`; no produce sonido. `MockVoiceProvider` conserva el nombre compatible y `SimulationVoice` conserva la lectura rápida del ensayo.
- `apps/studio/src/browser-voice.ts`: TTS opcional con SpeechSynthesis y voces instaladas (`localService`). Se selecciona desde un gesto del usuario antes de iniciar. No usa fetch, claves ni voces remotas. Si no hay voces locales, se informa en pantalla y sigue disponible el proveedor simulado. Se puede usar en el HTML portátil según las capacidades del navegador.
- Para conectar audio o TTS propio, implementa `VoiceProvider` y llama a `director.setVoiceProvider(provider)`. El proveedor controla el dispositivo real y notifica el ciclo de vida; no debe modificar marcador, comentarios, memoria ni imágenes. Los callbacks reciben tiempos absolutos de la misma base que el director (`Date.now` en producción).

`VoiceController` mantiene `idle`, `preparing`, `playing`, `paused`, `ended`, `cancelled` y `error`, posición, duración, texto, ID y método de sincronización. Reemplazar, terminar o cancelar invalida los callbacks anteriores antes de cancelar el dispositivo; las respuestas tardías no afectan a la siguiente frase. Hay un límite de preparación de 10 s por defecto (45 s para Voice Studio remoto) y 120 s de reproducción activa sin notificación final. Los errores conservan el comentario y liberan al director para seguir; la UI informa del motivo y permite seleccionar simulación.

## Reloj y avatar

Durante `preparing` y `paused`, el avatar recibe el reloj detenido y la boca cerrada. El director conserva su turno. Voice Studio permite interrupciones CRITICAL configurables; el modo anterior sin Voice Studio conserva su cola. En reproducción, el reloj de voz conduce las señales. Solo `ended` puede finalizar audio real; una estimación de duración agotada no corta la frase. Pausa y reanudación mantienen la posición. Terminar, silenciar, reiniciar o salir de la pantalla cancela el audio real además de cerrar la boca.

Un proveedor con alineación real puede emitir `timing(positionMs, durationMs, cues, now)`; se validan tiempos, duración, visemas y pesos antes de entregarlos al avatar. Las señales usan los visemas `sil`, `aa`, `E`, `O`, `M`. El puente previo `updateVoiceTiming` / `voiceEnded` sigue disponible para integraciones existentes y rechaza IDs obsoletos.

SpeechSynthesis no proporciona alineación fonética real. En ese adaptador las señales se estiman a partir del texto y el inicio, pausa y final de reproducción; la interfaz lo indica. La voz seleccionada no es todavía una voz personalizada de SamuIA. En v9 las señales llegan al renderer 2D de la imagen oficial: boca por capas en ejecución, parpadeo y movimiento localizado, sin editar los archivos ni desplazar la escena. El audio medible usa amplitud real; Web Speech conserva la estimación por texto. Consulta [Avatar Engine v9](avatar-engine-v9.md).

## Prueba

Abre **Partido de prueba**, elige proveedor y reproduce el recorrido completo o usa eventos manuales. El panel muestra el flujo, estado, reloj, boca y errores. **Pausar recorrido** detiene el siguiente paso; **Pausar voz** detiene la frase actual. **Terminar lectura simulada / Terminar voz actual** finaliza la reproducción conservando su publicación. **Silenciar voz** cancela la frase y pausa el recorrido.

Las pruebas cubren reloj determinista, pausa/reanudación, buffering sin boca activa, callbacks tardíos, errores y timeouts, visemas válidos/ inválidos, cola sin interrupciones y contrato del adaptador del navegador. Las pruebas de navegador ejercitan el panel con simulación y con un dispositivo SpeechSynthesis falso; no verifican sonido físico en CI.

## Evolución v8

Consulta [Voice Studio](voice-studio.md) para perfiles clonados, OpenAI/ElevenLabs, consentimiento y almacenamiento privado. Los mecanismos locales anteriores permanecen. `VoiceController` añade cola priorizada y deduplicación; `ReactionEvent` conserva contexto/origen/partido. `VoiceEvents.level` aporta amplitud medida para `audio-amplitude`, distinta de visemas fonéticos. Los proveedores remotos requieren credenciales y muestras reales: las pruebas CI usan fixtures y no acreditan una clonación real de Samuel. La reproducción del estudio persiste al navegar por páginas; salir/cerrar el productor cancela o pierde su lease.

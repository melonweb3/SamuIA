# Partido de prueba · SIMULATION · v5

## Abrirlo

Descarga de nuevo `downloads/SamuIA-Live-Studio.html` y abre la copia guardada. La cabecera debe mostrar **Retransmisión MVP v5**. Entra en **Partido de prueba** y pulsa **Reproducir partido completo**. También se puede abrir el HTML con `#partido-prueba` o esa misma ruta hash en el servidor local.

La pantalla reúne marcador, equipos, minuto, escenario y personaje oficiales, comentario activo, historial de comentarios, mensajes de la comunidad, reacción/expresión, intensidad, mirada y memoria. La reacción selecciona uno de los cinco retratos oficiales como referencia aparte; no se superpone sobre el micrófono. La composición del escenario permanece quieta y conserva todo su encuadre.

## Recorrido de 24 pasos

| Minuto         | Paso                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| 0              | Inicio comentado del Celta–Dépor                                                 |
| 5, 8           | Dos ocasiones del Celta registradas en estadísticas y contexto                   |
| 9              | Predicción de próximo gol publicada con datos y fuentes                          |
| 12             | Gol del Celta: se resuelve la predicción acertada y SamuIA la recuerda           |
| 15             | Ana pregunta por el Celta; SamuIA responde con el contexto actual                |
| 20, 26, 27, 32 | Amarilla, penalti, revisión del VAR y cambio                                     |
| 36–39          | Pregunta a la comunidad, tres votos de usuarios simulados y resumen: 2 de 3, 67% |
| 45             | Descanso y reanudación de la segunda parte, ambos comentados                     |
| 52, 54, 55     | Dos nuevas ocasiones y segunda predicción publicada                              |
| 59             | Marca el rival de lo predicho: predicción fallida y reconocimiento del error     |
| 67, 78         | Ocasión fallada y segundo gol del Celta                                          |
| 90             | Final 2–1 y reacción de victoria según la afinidad configurada en este ensayo    |

Los usuarios del guion son simulados. El chat también admite mensajes escritos por quien prueba la aplicación. La afinidad de esta sesión está configurada explícitamente con el Celta; no modifica los resultados ni las probabilidades.

El guion no escribe «acertada» ni «fallida» en la memoria. Publica una predicción antes del desenlace y la resuelve mediante eventos del partido; los IDs, timestamps y fuentes se pueden consultar en el contexto y las pruebas. Los votos pasan por ChatQueue y LiveMatchContextService; no se inventan porcentajes.

## Controles

- **Pausar recorrido** detiene el siguiente paso. La frase actual termina normalmente.
- **Siguiente paso** ejecuta solo una acción y espera a que su comentario quede publicado y termine la lectura antes de avanzar.
- **Terminar lectura simulada** finaliza el reloj de la frase actual. No evita publicar el comentario ni marca el mensaje como omitido.
- **Lectura rápida** reduce la duración del proveedor simulado. Desactivarla afecta a las siguientes frases. Para escuchar audio, selecciona una voz local en **Voz y flujo de retransmisión** antes de comenzar; depende de las voces instaladas en el navegador.
- El minuto avanza según el guion, para recorrer 90 minutos en una prueba corta. Las pausas no hacen avanzar el reloj del partido. En modo manual se puede adelantar el minuto, nunca retroceder.
- **Responder al chat automáticamente** atiende la cola al quedar libre el director. Se puede desactivar y responder cada mensaje con su botón.
- **Eventos manuales** permiten iniciar, reanudar, simular ocasiones, goles, tarjetas, penalti, VAR, cambios, descanso y final. No pueden insertarse en mitad de un paso guiado.
- **Publicar predicción** requiere ocasiones recientes según las mismas reglas del CommentaryEngine. Los controles de acierto/fallo requieren una predicción pendiente y crean un gol adecuado o dejan vencer el plazo si la predicción era neutral. No alteran su estado directamente.
- Usar eventos, comentarios editoriales o minutos manuales cambia esta sesión a modo manual. Para volver al guion desde el principio, pulsa **Nuevo partido de prueba**. Reiniciar solo borra los datos de este ensayo.
- Al cambiar de pantalla se pausa el guion y se conserva la sesión, incluidos los reinicios. Recargar el HTML comienza una sesión nueva, igual que el resto de la demo.

## Arquitectura reutilizada

`MatchSimulationSession → ReactionDirector → MatchManager / SportsReactionScheduler → CommentaryEngine + LiveMatchContextService → AvatarAnimationController`

Los mensajes usan `ChatQueue → SamuIABrain → CommentaryEngine`. El historial publicado incluye `sourceIds` y `memoryIds` para enlazar una acción con su comentario y sus recuerdos. El coordinador no avanza un paso hasta encontrar su comentario publicado y quedar libre la cola; las tarjetas y cambios no quedan filtrados en este ensayo (todos los eventos del partido de prueba están habilitados).

`packages/match-simulation/src/index.ts` es solo un coordinador del guion: no contiene otro motor de fútbol, otra memoria, un generador alternativo de comentarios ni un segundo controlador de animaciones. Usa una instancia aislada del mismo ReactionDirector, también en la versión servida. No modifica el director del estudio, sus preferencias, el resto de partidos ni su chat. El panel se puede retirar después sin cambiar los motores.

ReactionDirector acepta opcionalmente una lista de encuentros y desactivar su avance automático de minutos. El comportamiento predeterminado del estudio sigue siendo el mismo. Los nuevos eventos `kickoff` y `second_half` pasan por las mismas suscripciones, cola, comentario y observación del contexto; sustituir únicamente el estado ya no deja el inicio sin comentar.

El panel **Voz y flujo de retransmisión** permite pausar/reanudar la frase, silenciarla, ver el estado del proveedor, reloj, sincronización y errores, y comprobar evento → partido → comentario → emoción → avatar → voz → interfaz. Pausar la voz impide avanzar hasta reanudarla o terminarla. Silenciar conserva el comentario publicado y libera la cola después del cooldown. Cambiar de pantalla o reiniciar cancela el audio pendiente.

El HTML incluye todos los motores y los PNG oficiales archivados; no requiere servidor ni API externa. En modo servidor, el resto del estudio conserva sus rutas `/api`, SSE y controles. No se han añadido claves ni dependencias.

## Límites de esta prueba

Los comentarios los genera el motor local existente con reglas y plantillas, no una API de LLM. La voz usa un controlador independiente del proveedor. La opción predeterminada es simulada; las voces locales del navegador pueden emitir audio si están disponibles. Su temporización de boca es aproximada desde texto; un futuro proveedor puede aportar reloj y visemas medidos. Consulta [el contrato y ciclo de vida](voz.md). El controlador emite animaciones, expresiones y señales, pero los PNG siguen siendo fallback estático; todavía no hay modelo 2D/3D articulado, parpadeo facial ni lip-sync visual real. No se mueve toda la habitación ni se recorta el personaje sobre el micro para fingir animación.

## Verificación

- Tests del coordinador: recorrido completo, 24 publicaciones, 16 eventos observados, fuentes verificables, una predicción acertada y otra fallida, votos reales del simulador, aislamiento, pausa, fases inválidas y respuesta a mensajes manuales.
- Navegador offline: los 24 pasos pasan por los botones de la pantalla hasta el resultado final 2–1; se comprueban comentario, reacciones, porcentajes y memoria, sin solicitudes externas.
- Navegador servido: conversación manual, navegación, reinicio aislado y vista móvil.
- También se ejecutan los tests existentes de partidos, chat, memoria, avatares, controles de simulación y conservación exacta de las imágenes.

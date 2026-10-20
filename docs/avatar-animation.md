# Avatar Animation · contrato y evolución v9

La instrucción del usuario sobre avatar animado sustituye la restricción anterior de diseñar el personaje como una composición estática. Las imágenes siguen siendo referencias oficiales y fallback; no son el contrato del personaje. No se han modificado sus bytes, identidad ni vestuario.

## Flujo

`CommentaryEngine → ReactionDecision.avatar → ReactionDirector → AvatarAnimationController → StudioSnapshot.animation → AvatarRendererHost → renderer 2D/3D`

`packages/shared/src/avatar.ts` define el contrato sin SDK ni nombres de imágenes. `packages/avatar-animation/src/index.ts` implementa el controlador, los visemas de simulación y el contrato del adaptador. Funciona en servidor y HTML offline. `AvatarRendererHost.tsx` interpola las señales con requestAnimationFrame, monta el adaptador una vez y lo libera al desmontar o sustituirlo. Las actualizaciones de estado no deben volver a cargar el modelo.

Estados: `idle`, `talking`, `happy`, `goal`, `shock`, `angry`, `laugh`, `frustrated`, `thinking`, `var`, `penalty`, `win`, `loss`.

La animación principal y el habla son independientes: puede celebrar y hablar simultáneamente. Una reacción breve da paso a `talking` si sigue la frase, y después a `idle`. Cada ejecución tiene `clipId` distinto, incluso dos goles seguidos, para que un renderer pueda relanzar el clip. La expresión es independiente de la animación.

## Contrato editorial

Cada salida de CommentaryEngine incluye el texto `decision.say`, emoción editorial `decision.emotion`, energía `decision.energy` (0–100) y `decision.avatar`:

```ts
{
  animation: 'goal',
  expression: 'happy',
  intensity: 1,       // 0–1
  gaze: 'match'       // camera | chat | match | radar
}
```

| Evento                                               | Animación  | Expresión   |
| ---------------------------------------------------- | ---------- | ----------- |
| goal / GOAL                                          | goal       | happy       |
| var / VAR_CHECK                                      | var        | thinking    |
| penalty                                              | penalty    | shock       |
| chance                                               | shock      | shock       |
| missed_chance / MISSED_CHANCE                        | frustrated | frustrated  |
| yellow                                               | angry      | angry       |
| red                                                  | shock      | shock       |
| fulltime con afinidad configurada y victoria/derrota | win / loss | happy / sad |
| análisis o espera de respuesta                       | thinking   | thinking    |

El contrato de eventos de esta demo usa los identificadores en minúsculas; un futuro proveedor externo debe normalizar sus IDs. `chance` no afirma que se haya fallado. `missed_chance` es un evento separado: aumenta tiro y xG simulados, sin gol ni tiro a puerta. Un empate o un partido sin afinidad no inventa una victoria/derrota del comentarista.

Los borradores antiguos sin `avatar` se normalizan desde emoción y gesto. Esto mantiene el chat y los controles existentes compatibles. Las reacciones deportivas respetan cola, suscripciones, prioridad, pausa y cooldown. Una alerta pendiente no dispara una animación por sí sola.

## Señales del renderer

- `head`: yaw, pitch y roll en grados; `body`: inclinación y respiración/bote normalizados.
- `blink`: cierre de párpados entre 0 y 1. El reposo incluye respiración, pequeños movimientos y parpadeo deterministas.
- `gaze`: destino semántico y coordenadas normalizadas; el adaptador decide la posición física de sus ojos/cabeza.
- `mouth`: visema y apertura 0–1; `speech`: ID de frase, texto, reloj y cues.
- `transitions`: últimas 30 transiciones; ayuda a verificar clips y cancelaciones.

En v9, la presentación integrada usa `OfficialImageRenderer`: parpadeo, boca por capas oficiales y una malla local de cabeza/torso, conservando el encuadre, fondo y micrófono. El visor de retratos sigue estático. El controlador existente incorpora `ReactionLibrary` y estado visual; no hay rig 3D ni mirada ocular implementada. Los modos avanzados indican fallback 2D. Consulta [Avatar Engine v9](avatar-engine-v9.md) para calibración, capacidades, privacidad y límites.

## Conectar un modelo 2D o 3D

En la entrada React se puede inyectar un adaptador, sin cambiar CommentaryEngine, cola ni controlador:

```tsx
import { AvatarRendererProvider } from './AvatarRendererHost';
import type { AvatarRendererFactory } from '../../../packages/avatar-animation/src/index';

const modelRenderer: AvatarRendererFactory = (host) => {
  // Crear aquí el canvas y el modelo oficial con el SDK elegido.
  return {
    name: 'samuia-model',
    capabilities: { headBody: true, blink: true, lipSync: true, expressions: true, gaze: true },
    update(frame) {
      // Cambiar clip al cambiar frame.animation; repetirlo si cambia frame.clipId.
      // Aplicar frame.head/body, blink, expression, gaze y mouth al rig.
    },
    dispose() {
      // Liberar canvas, modelo, listeners y recursos GPU propios.
    },
  };
};

<AvatarRendererProvider value={modelRenderer}>
  <App />
</AvatarRendererProvider>;
```

Con adaptador conectado, el fondo usa la habitación vacía original: nunca la composición que ya contiene una persona. El host oculta el fallback para evitar duplicar personajes. El modelo deberá conservar la misma identidad oficial; no se ha elegido SDK ni creado un rig/modelo nuevo en esta entrega.

## Conectar voz y lip-sync real

Actualmente se usa la duración estimada del mismo proveedor mock para la frase y el controlador. Los cues se derivan de letras y pausas: **no son fonemas alineados ni audio generado**. Al pulsar Callar, sustituir una previsualización o finalizar la frase, se descarta el ID de voz anterior y se cierra la boca.

El puente de una voz real puede enviar el progreso medido a:

```ts
director.updateVoiceTiming(utteranceId, positionMs, durationMs, visemeCues, now);
director.voiceEnded(utteranceId, now);
```

`utteranceId` se obtiene de `snapshot.animation.speech.id`. El progreso actualiza el mismo reloj que usa el director y cambia la fuente a `audio-visemes`; los callbacks antiguos o cues inválidos se rechazan. El nuevo `VoiceController` gestiona preparación/buffering, pausa, fin y cancelación antes de enviar el reloj al avatar. Hay proveedor simulado y adaptador opcional de Web Speech con voces locales; Voice Studio v8 añade adaptadores de voz personalizada en el servidor. Consulta [el contrato de voz](voz.md) y [Voice Studio](voice-studio.md).

## Probar

Abre **SIMULATION**. Puedes elegir los 13 estados, texto e intensidad, ejecutar una reacción, cambiar mirada y detener avatar/voz. Los medidores muestran boca y parpadeo en tiempo real, además de expresión, cabeza, cuerpo, frase y transiciones.

Los controles «Ejecutar animación» son previsualizaciones explícitas: interrumpen la frase, no modifican resultados ni memoria de partido. Los botones «Evento: …» sí pasan por el motor deportivo y las reglas normales; si está hablando o hay cooldown, esperan en cola. No desactivan filtros en silencio.

La edición descargable actual muestra **Retransmisión MVP v5**. Vuelve a descargar el HTML para actualizar una copia anterior. Las pruebas cubren señales, estados, tiempos de voz, interrupciones, callbacks tardíos, mapeos de eventos, datos deportivos, API y simulación offline en navegador.

## Corrección de encuadre · v3.1

SIMULATION respeta la misma presentación elegida en Dashboard; ya no fuerza un retrato superpuesto sobre el micrófono. La vista de escenario conserva la relación 1672:941 completa y sin recortar los laterales. Los fallbacks no reciben transformaciones de cámara, balanceo o respiración. Las señales siguen activas para un renderer con rig real. El visor de retratos originales no muestra la habitación ni simula su integración con el mobiliario.

El marcador y la competición se muestran debajo de la imagen, fuera del encuadre, para no tapar el micrófono ni el escritorio.

## Voz v8 y amplitud

`VoiceEvents.level` y `AvatarAnimationController.updateSpeechAmplitude` transportan amplitud medida 0–1 con caducidad; la fuente se marca `audio-amplitude`. El futuro rig puede abrir la boca con ese valor antes de disponer de fonemas/visemas. Se conserva el reloj/contrato previo y las imágenes no se modifican. Voice Studio permite que un CRITICAL interrumpa una frase de menor prioridad si está configurado. No se ha creado un avatar completo ni alineación fonética en esta fase.

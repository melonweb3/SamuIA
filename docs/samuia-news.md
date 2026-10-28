# SamuIA News · circuito editorial

La fase 3 añade OpenAI opcional, persistencia y generación desde noticias pendientes.
Consulta [la guía actual de configuración y despliegue](samuia-news-phase-3.md).
El recorrido local que sigue continúa disponible.

## Probar el primer informativo

Desde la raíz, `corepack pnpm dev`. En Dashboard cambia **Modalidad de programa**
a **NOTICIAS** y conserva **SIMULATION**. Aparecen nueve noticias ficticias, una
por categoría. Ninguna se presenta como actualidad real.

1. Elige categorías y pulsa **Aprobar contenido** en las noticias seleccionadas.
2. Elige duración solicitada (5/15/30/60 minutos), cantidad, formato, preguntas y
   alertas. **Crear escaleta** genera introducción, titulares, piezas por categoría,
   turno de preguntas opcional y despedida.
3. Revisa los textos. Puedes editarlos, elegir escena y cambiar su posición.
   Cada modificación exige volver a aprobar la escaleta.
4. Pulsa **Aprobar escaleta** e **Iniciar informativo**. Pausa y reanuda la misma
   reproducción. **Terminar intervención actual** permite acelerar la prueba.
   **Detener informativo** cancela su voz y detiene el avance.
5. Para ensayar una interrupción, pulsa **Simular noticia de última hora**, aprueba
   ese contenido y **Autorizar interrupción**. Después se repite desde el inicio
   la pieza interrumpida; no se pretende reanudar una muestra de audio a mitad.
6. Añade una pregunta como «¿Dónde ocurrió eso?» en el chat y pulsa Responder.
   El cerebro consulta la última noticia presentada. También puede reservar una
   respuesta automática entre piezas cuando se habilita la interacción.
7. Cambia a DEPORTES: los partidos, sus datos y motores permanecen disponibles.

El HTML generado en `.local/SamuIA-Live-Studio.html` y la entrega en `downloads/`
permiten el mismo recorrido ficticio sin servidor ni solicitudes de red.
Las fuentes externas y Voice Studio remoto siguen necesitando el servidor.

La duración es un presupuesto máximo, no una promesa de rellenar minutos. El
panel calcula el tiempo de lectura del texto disponible. Las duraciones de voz
simulada y de audio efectivo pueden variar; los límites de formato son objetivos
editoriales (15/30/60 segundos), sin añadir hechos para alargar una noticia.

## Arquitectura reutilizada

`NewsSourceManager → Newsroom → SamuIABrain → ReactionDirector → VoiceController /
AvatarAnimationController → VideoCompositor → BroadcastOutputManager`.

- Newsroom contiene catálogo, agrupación, revisiones y escaleta; no produce audio
  ni tiene otro reloj/director. No sustituye los motores deportivos.
- SamuIABrain genera los guiones y responde con los datos en contexto. El generador
  local y determinista permanece disponible. El proveedor remoto opcional de la
  fase 3 vive exclusivamente en el servidor; no verifica automáticamente los hechos.
- La reserva del chat, ejecución de intervenciones, pausas, cancelación, historial,
  voz, avatar oficial, fondos y emisión son los existentes.
- Las escenas informativas son capas de presentación: estudio, titulares, texto,
  imágenes autorizadas (espacio provisional sin material remoto), última hora,
  chat y despedida. El estudio y la señal codificada comparten la regla de
  presentación, titulares, fuentes y ticker; no se alteran PNG ni ZIP.
- DEPORTES conserva su comportamiento. NOTICIAS utiliza la escaleta. CHAT conserva
  la cola. EVENTOS ofrece el control manual compartido, sin otro motor específico.
  AUTOMÁTICO prioriza el informativo aprobado en ejecución y vuelve a los deportes
  al terminar; no es todavía un programador horario de emisiones.

## Fuentes externas y seguridad

El servidor admite RSS, Atom y JSON normalizado. Configura dominios HTTPS exactos
**previamente revisados por el operador** en `NEWS_ALLOWED_HOSTS` (separados por
comas). En el entorno cloud también deben estar permitidos por la política de
red. Añade nombre, URL, categoría y permiso de uso en el panel; activa cada fuente
por separado. Registra el enlace a las condiciones y una nota de comprobación
del permiso, también para titulares. Se consultan las categorías activas con el
intervalo guardado (un minuto por defecto) o al actualizar.

Las consultas bloquean IP literales, HTTP, credenciales en URL, puertos especiales,
redirecciones, dominios no autorizados y resoluciones DNS internas/reservadas.
El destino autorizado es de configuración privada del servidor, no controlable
por un artículo ni por el formulario del navegador. Conserva la protección de
red del entorno/proxy y configura únicamente proveedores de confianza.

Las respuestas tienen límite de un MiB y diez segundos de descarga; DNS tiene
cinco segundos de límite. Se rechazan DTD/entidades externas y XML mal formado.
No se descargan artículos completos ni imágenes. El uso por defecto conserva solo
el titular y enlace; los extractos requieren autorización explícita del operador.
Los fallos publicados no contienen respuestas privadas ni tokens.

Para una API con Bearer, configura `NEWS_API_KEY` de forma segura y
`NEWS_API_HOST` con su dominio exacto, también incluido en la lista permitida.
No escribas claves en URLs, scripts ni chat. Los parámetros de URL admitidos son
`category`, `page`, `limit`, `lang` y `format`; otras autenticaciones requieren un
adaptador específico. Las fuentes no necesitan claves cuando el RSS es público.

Ejemplo del contrato JSON (datos ficticios, no una fuente de actualidad):

```json
[{"title":"Ejemplo ficticio", "url":"https://medio-autorizado.example/noticia",
  "publishedAt":"2026-10-27T12:00:00Z", "summary":"Extracto autorizado"}]
```

Se conservan nombre de fuente, enlace, fecha, contenido autorizado y referencias.
La clasificación usa reglas locales transparentes y la categoría de origen como
alternativa. La agrupación por título/enlace es orientativa: varios medios no
prueban que los hechos sean independientes. Nunca se confirma una noticia solo
por aparecer en un RSS. La confirmación requiere una nota de comprobación del
operador. Una noticia aprobada para la escaleta puede seguir identificada como
no confirmada; no puede interrumpir como última hora real sin confirmación.

Las noticias de más de 24 horas se excluyen de nuevos programas. Se rechazan
fechas ausentes y fechas futuras fuera de cinco minutos. Una actualización
invalida su revisión/confirmación y cualquier escaleta afectada. No se vuelve a
anunciar la misma revisión de una última hora. Las demostraciones nunca pueden
confirmarse como hechos reales y permanecen identificadas como ficción.

## Alcance y siguientes pasos

El servidor conserva ahora fuentes, noticias, programas y preferencias en memoria
persistente privada y dispone de OpenAI opcional, con límites y fallback. La guía de
[fase 3](samuia-news-phase-3.md) describe las variables, formato, volumen y revisión
necesaria al recuperar programas. El HTML portátil conserva el modo local offline.
La verificación factual automática, el ejecutor de calendario y los motores completos
de otros eventos siguen pendientes. No se activan fuentes ni emisiones públicas solas.

## Archivos de esta fase

- Contratos: `packages/shared/src/news.ts`, `packages/shared/src/index.ts`.
- Estado editorial y validación: `packages/news/package.json`,
  `packages/news/src/index.ts`, `packages/news/src/schema.ts`.
- Cerebro y coordinación reutilizados: `packages/samuia-brain/src/index.ts`,
  `packages/core/src/index.ts`.
- Entrada HTTP y fuentes: `apps/server/src/news-sources.ts`,
  `apps/server/src/server.ts`, `apps/server/src/commands.ts`,
  `apps/server/package.json`, `pnpm-lock.yaml`, `.env.example`.
- Interfaz y señal: `apps/studio/src/NewsDesk.tsx`,
  `apps/studio/src/NewsGraphics.tsx`, `apps/studio/src/App.tsx`,
  `apps/studio/src/StudioScenery.tsx`, `apps/studio/src/VideoCompositor.ts`,
  `apps/studio/src/style.css`.
- Pruebas añadidas: `tests/news.test.ts`, `tests/news-sources.test.ts`,
  `tests/server-news.test.ts`, `tests/e2e/news.spec.ts`.
- Guía y entrega: `README.md`, `docs/samuia-news.md`,
  `downloads/SamuIA-Live-Studio.html` (generado).

## Resultado histórico de validación de la fase 2

- Lint y comprobación de tipos superados.
- Compilación de UI, servidor y HTML portátil superada.
- 190 pruebas unitarias e integración superadas (35 nuevas respecto a fase 1).
- 26 pruebas de navegador superadas: las 23 anteriores y tres recorridos de noticias.
- Se verifican también móvil, ausencia de red en el portátil y titulares/fuentes
  dibujados en el compositor, además de la autorización de última hora.
- Los servicios externos reales no se han consultado: los adaptadores se prueban
  con fixtures y la demostración no requiere credenciales.

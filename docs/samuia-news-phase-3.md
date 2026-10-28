# SamuIA News · fase 3

## Uso del panel

1. Ejecuta `corepack pnpm dev` desde la raíz y abre el estudio. Selecciona
   **NOTICIAS**. El modo de datos **SIMULATION** puede seguir activo: controla
   los partidos y el reloj de voz, independientemente del proveedor de guiones.
2. En **Cerebro y memoria del informativo**, elige **SIMULACIÓN**, **IA REAL** o
   **AUTOMÁTICO CON FALLBACK**; selecciona modelo, tokens por respuesta y límites
   diarios. **Guardar configuración de IA** no realiza llamadas de pago.
3. Sin servicios externos, carga las nueve noticias ficticias. Para información
   real añade fuentes autorizadas y pulsa **Actualizar fuentes**.
4. Selecciona categorías, formato, cantidad y presupuesto de duración. **Generar
   informativo** actualiza las fuentes en los modos con IA y prepara introducción,
   titulares, piezas agrupadas, preguntas opcionales y despedida. En SIMULACIÓN
   usa únicamente los datos ya disponibles y el generador local. **Crear escaleta**
   conserva el recorrido local de la fase 2 con contenidos previamente aprobados.
5. El borrador puede incluir noticias pendientes: no están autorizadas para emitir.
   Revisa fuentes, fecha, estado de verificación y guiones. Aprueba cada noticia
   utilizada, edita las intervenciones y pulsa **Aprobar escaleta**. Las noticias
   no confirmadas siguen identificadas como tales. La confirmación editorial
   requiere registrar una comprobación; un RSS o un LLM nunca la sustituyen.
6. Pulsa **Iniciar informativo**. Conserva la voz, avatar, escenas, chat y salida
   habituales. **Terminar intervención actual** acelera el ensayo simulado.
7. **Guardar programa en archivo** crea una copia recuperable. **Recuperar
   programa** lo devuelve a borrador y exige aprobación. Los datos se guardan
   también automáticamente cada segundo, al gestionar el panel y al cerrar
   ordenadamente el servidor. Ninguna recuperación inicia una emisión.

**Deportes** sigue agrupando **Fútbol** y **Otros deportes**, además de conservar
la categoría anterior. España, Galicia, Internacional, Tecnología, Inteligencia
artificial, Economía y Criptomonedas permanecen disponibles. Entretenimiento se
conserva por compatibilidad. No se han sustituido los motores deportivos ni se
ha añadido un motor completo de otros eventos.

## OpenAI

Configura exclusivamente en el entorno privado del servidor:

```dotenv
OPENAI_API_KEY=tu-credencial-privada
OPENAI_NEWS_MODEL=gpt-4.1-mini
```

Autoriza `api.openai.com` en la política de salida del despliegue. El SDK oficial
`openai` usa Responses API, `store: false`, timeout de veinte segundos y ningún
reintento automático. Las consultas de noticias y del SDK respetan el proxy,
`NO_PROXY` y la confianza TLS heredados; no se desactiva la validación TLS.
No se necesita otro proveedor, frontend con claves ni un endpoint externo configurable.

El panel muestra si existe una credencial y el resultado de la última generación,
no una supuesta conexión verificada al guardar. La comprobación real se produce
al generar. Sin credenciales, SIMULACIÓN funciona completamente; AUTOMÁTICO
CON FALLBACK devuelve el generador local si faltan credenciales, hay errores,
se alcanza el presupuesto o la respuesta no supera la validación estructural.
IA REAL comunica el error y no sustituye silenciosamente los guiones. En preguntas
del chat, un error en IA REAL produce una respuesta local identificada como tal.

Se envían únicamente fuentes y datos estructurados de las noticias seleccionadas,
secciones anteriores y, para el chat, la pregunta acotada sin nombre de espectador.
El sistema pide distinguir ficción, información atribuida y revisión editorial,
rechaza referencias inexistentes, enlaces añadidos, respuestas vacías, excesivas
o con formato inválido, y conserva atribución y etiquetas de fiabilidad.
La validación estructural **no demuestra la veracidad de una frase generada**:
los guiones requieren revisión editorial antes de emitir. `store: false` evita
crear almacenamiento de respuestas de la aplicación en Responses API; no sustituye
las condiciones de tratamiento de datos del proveedor.

Los límites diarios son por instancia y día UTC, con 100 llamadas y 50 000 tokens
por defecto. Se reserva un máximo conservador antes de llamar; tras la respuesta
se sustituye por el consumo comunicado. Los errores conservan la reserva cuando
no se conoce su consumo. Se persiste antes de hacer la llamada para no perder
la reserva en un reinicio. El panel muestra tokens contabilizados o reservados,
no una factura en euros. Configura además límites en tu cuenta de OpenAI.
La caché acotada evita repetir solicitudes idénticas durante la sesión.
No se comparten presupuestos entre varios procesos.

## Conectar un RSS o API real

1. Elige un proveedor y comprueba sus condiciones actuales: permiso de titulares,
   extractos, atribución y uso en retransmisiones. No se ha concedido una licencia
   por recibir el contenido. No se incluye ninguna fuente externa activa de serie.
2. En el servidor define `NEWS_ALLOWED_HOSTS` con el dominio HTTPS **exacto** del
   feed, sin comodines ni rutas. Permite ese dominio también en la política de red.
3. En **Fuentes RSS y API**, introduce nombre, URL HTTPS, tipo RSS/Atom o JSON,
   categoría, permiso de uso, enlace HTTPS a condiciones y nota de la comprobación.
   Sin esa documentación no se añade la fuente. Para extractos se requiere permiso
   específico. Por defecto solo se conservan titular, enlace, fuente y fecha.
4. Añade la fuente y actualiza. Comprueba los elementos recibidos y el historial.
   Las redirecciones se rechazan: configura la URL HTTPS final autorizada.
5. El intervalo inicial es `NEWS_REFRESH_SECONDS` (60–3600 s); después prevalece
   el intervalo guardado desde el panel. Solo se actualizan las categorías activas.

Para APIs Bearer configura `NEWS_API_HOST` y `NEWS_API_KEY`, sin escribir secretos
en URLs ni campos del navegador. La credencial solo se envía al dominio exacto
configurado y autorizado. El contrato JSON normalizado y los límites de descarga,
DNS, tamaño, fechas y XML se describen en [la guía de fuentes](samuia-news.md).
Se conserva la deduplicación y agrupación existente, con identificación de fuente
y revisión invalidada ante cambios. El historial guarda hasta cien actualizaciones,
con cantidad recibida antes de deduplicar; recibir elementos no implica veracidad.

El catálogo opcional se configura con `NEWS_SOURCE_CATALOG_FILE` apuntando a un
JSON privado que siga el esquema de alta. `config/news-sources.example.json` es
una plantilla vacía. Ejemplo de formato **ficticio, no utilizable como fuente real**:

```json
[
  {
    "name": "Medio elegido por el operador",
    "url": "https://medio-autorizado.example/rss",
    "kind": "rss",
    "category": "Galicia",
    "enabled": false,
    "usage": "headlines",
    "termsUrl": "https://medio-autorizado.example/condiciones",
    "termsNote": "Registrar aquí la comprobación real y el alcance del permiso."
  }
]
```

Las entradas se importan desactivadas, sin duplicar URLs guardadas y solo si su
host está autorizado. Un fallo queda registrado como evento. No se consultan las
condiciones automáticamente ni se presume autorización; el operador debe revisar
la licencia del proveedor concreto antes de añadirlo.

## Almacenamiento y despliegue

Se reutiliza el patrón de archivos JSON privados de Voice Studio y Reaction Studio,
con un sobre `version: 1`, validación de estructura, reemplazo mediante archivo
temporal y permisos 0600. No se introduce SQLite ni otro servicio para este estado
acotado. Los esquemas permiten incorporar migraciones: una versión desconocida o
un archivo corrupto se conserva y se comunica, sin sobrescribirlo con estado vacío.

```dotenv
NEWS_STORAGE_FILE=.local/news/state.json
NEWS_REFRESH_SECONDS=60
NEWS_SOURCE_CATALOG_FILE=
```

Se guardan fuentes y permisos, categorías, hasta 200 noticias con sus revisiones y
verificación, escaleta actual/configuración, preferencias del estudio y personalidad,
configuración de IA sin claves, contadores diarios, hasta 30 programas archivados,
cien eventos, cien actualizaciones y cien cambios de estado de programas.
El historial de emisiones registra fecha, estado, categorías y duración prevista;
no es una grabación audiovisual ni acredita que una plataforma pública recibiera
la señal. Los mensajes y nombres de espectadores, el contexto de chat en ejecución,
los audios y claves API no se incluyen en esta memoria.

Monta el directorio padre de `NEWS_STORAGE_FILE` en un volumen duradero, privado y
con permiso de escritura para el usuario del servidor; haz copias del archivo fuera
del directorio público. No lo coloques en `apps/studio/public` ni en `downloads`.
Mantén **una instancia escritora** por archivo: no hay bloqueo ni base de datos
compartida entre réplicas. Reiniciar sin volumen persistente en un contenedor efímero
perderá los datos. Un corte abrupto puede perder hasta el último segundo de cambios;
el cierre ordenado guarda el estado. Los programas recuperados vuelven a borrador,
sin intervención actual, sin voz activa y sin aprobación previa.

## Programación futura y chat

`POST /api/news/manage` admite `action: schedule` con id, fecha, hora,
`timezone: Europe/Madrid`, tipo de programa, duración, categorías, estado
`draft/cancelled` y configuración de salida con `simulation: true`. Se valida y
persiste; **no existe un ejecutor de calendario ni emisiones automáticas**.

El chat sigue entrando por la cola y reserva existentes. El adaptador asíncrono
recibe la última noticia presentada y las secciones del programa; comparte texto
con voz, avatar y rótulos. Una respuesta cuyo modo o revisión han cambiado se
descarta. Sin datos, el generador debe reconocer la falta de información; la fecha
de publicación no se interpreta como disponibilidad de un producto.

## Componentes y archivos

Se conservan SamuIABrain, ReactionDirector, Newsroom, Voice Studio, controladores de
voz y avatar, personalidad, integraciones deportivas, escenas, compositor, emisión,
modo portátil y generador determinista. El adaptador remoto existe solo en el servidor.

Archivos de la fase 3 (sobre el trabajo local de fase 2):

- Nuevos: `apps/server/src/news-brain.ts`, `news-service.ts`, `news-storage.ts`,
  `news-http.ts`, `apps/studio/src/NewsBrainControls.tsx`,
  `tests/news-brain.test.ts`, `tests/news-persistence.test.ts`,
  `tests/e2e/news-intelligence.spec.ts`, `config/news-sources.example.json`,
  `docs/samuia-news-phase-3.md`.
- Ampliados: `apps/server/src/news-sources.ts`, `server.ts`, `package.json`,
  `apps/studio/src/NewsDesk.tsx`, `packages/shared/src/news.ts`, `index.ts`,
  `packages/news/src/index.ts`, `schema.ts`, `packages/samuia-brain/src/index.ts`,
  `packages/core/src/index.ts`, `tests/news-sources.test.ts`,
  `tests/e2e/news.spec.ts`, `avatar-engine.spec.ts`, `live.spec.ts`,
  `multiplatform.spec.ts`, `voice-studio.spec.ts`, `pnpm-lock.yaml`,
  `apps/studio/src/style.css`, `.env.example`, `README.md`,
  `docs/samuia-news.md` y HTML portátil generado.
  Las pruebas de navegador usan almacenamiento aislado; se conservan sus aserciones.

## Alcance pendiente

Hace falta configurar credenciales y autorizar proveedores concretos para probar
OpenAI y noticias contra servicios reales. Este entorno no tiene secretos asociados
ni permite actualmente destinos de noticias/OpenAI. No se han realizado llamadas de
pago; las pruebas utilizan fixtures o transporte simulado del SDK oficial. No se han
verificado licencias de medios concretos ni se ha activado ninguno automáticamente.

Para emitir públicamente siguen haciendo falta las credenciales y permisos de las
plataformas, fuentes con derechos adecuados, voz/audio y salida configurados, y una
prueba de extremo a extremo en las cuentas de destino. Los motores deportivos y la
previsualización existentes se conservan. Quedan para otras fases el ejecutor horario,
recurrencia, coordinación de varias instancias, verificación factual automática,
motores completos de otros eventos y extracción de movimientos definitivos del avatar.

## Inventario completo de cambios locales (fases 2 y 3)

```text
.env.example
README.md
apps/server/package.json
apps/server/src/commands.ts
apps/server/src/news-brain.ts
apps/server/src/news-http.ts
apps/server/src/news-service.ts
apps/server/src/news-sources.ts
apps/server/src/news-storage.ts
apps/server/src/server.ts
apps/studio/src/App.tsx
apps/studio/src/NewsBrainControls.tsx
apps/studio/src/NewsDesk.tsx
apps/studio/src/NewsGraphics.tsx
apps/studio/src/StudioScenery.tsx
apps/studio/src/VideoCompositor.ts
apps/studio/src/style.css
config/news-sources.example.json
docs/samuia-news-phase-3.md
docs/samuia-news.md
downloads/SamuIA-Live-Studio.html
packages/core/src/index.ts
packages/news/package.json
packages/news/src/index.ts
packages/news/src/schema.ts
packages/samuia-brain/src/index.ts
packages/shared/src/index.ts
packages/shared/src/news.ts
pnpm-lock.yaml
tests/e2e/avatar-engine.spec.ts
tests/e2e/live.spec.ts
tests/e2e/multiplatform.spec.ts
tests/e2e/news-intelligence.spec.ts
tests/e2e/news.spec.ts
tests/e2e/voice-studio.spec.ts
tests/news-brain.test.ts
tests/news-persistence.test.ts
tests/news-sources.test.ts
tests/news.test.ts
tests/server-news.test.ts
```

## Verificación de esta entrega

- `corepack pnpm lint`: correcto, sin advertencias de lint.
- `corepack pnpm typecheck`: correcto.
- `corepack pnpm test`: 205 pruebas correctas en 22 archivos; se conservan las
  190 de fase 2 y se añaden quince comprobaciones.
- `corepack pnpm build`: interfaz, servidor y HTML portátil correctos. Vite mantiene
  la advertencia de tamaño de chunk superior a 500 kB; no impide compilar ni arrancar.
- Batería completa de navegador: 27/27 correctas (las 26 anteriores y una nueva).
- Sobre la compilación final se repiten los cuatro recorridos de noticias: 4/4
  correctos, incluidos móvil, funcionamiento offline, generación, reinicio,
  recuperación, revisión editorial y última hora con compositor.
- Se prueba el SDK oficial con transporte HTTP simulado, sin llamadas de pago,
  además de generación local, cache, límites, fallback, fuentes y credenciales.
- El archivo descargable coincide con `.local/SamuIA-Live-Studio.html`.
- `git diff --check` correcto. Sin cambios en assets originales ni archivos públicos
  de referencia; las pruebas comprueban también integridad visual y bytes offline.
- La publicación en GitHub se realiza únicamente tras una petición explícita del usuario.

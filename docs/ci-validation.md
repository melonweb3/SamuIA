# Dependencias multimedia de CI

El job `SamuIA checks / validate` utiliza Ubuntu 24.04 y Node 22. La versión de
pnpm está fijada por `packageManager`; la instalación conserva `--frozen-lockfile`.
La imagen de Ubuntu se fija para poder reproducirla sin depender de cambios de
`ubuntu-latest`.

El resumen público de la ejecución `40616232012` advierte de que esa etiqueta
comienza a migrar a Ubuntu 26 el 19 de octubre de 2026. El pin evita esa variación;
la instalación explícita de dependencias evita depender del software preinstalado.

Antes de ejecutar las pruebas, el workflow instala el paquete de distribución
`ffmpeg`, que incorpora `ffmpeg`, `ffprobe` y sus bibliotecas. La compilación debe
incluir libx264, AAC y Flite. `scripts/check-media-tools.mjs` comprueba esas
capacidades, RTMP, los filtros de fixtures y los formatos de salida; genera una
voz local Flite real e inspecciona el WAV PCM resultante mediante FFprobe.
La comprobación no consulta servicios externos ni necesita claves.

## Causa de los cinco fallos del commit 52a8334

Con Node 22 y un PATH sin FFmpeg/FFprobe se reproducen exactamente 200 pruebas
correctas y cinco fallidas:

- Dos pruebas de avatar no pueden generar el vídeo de referencia: `spawn ffmpeg
ENOENT`.
- La integración RTMP tampoco puede generar ni recibir la señal H.264/AAC.
- Voice Studio no alcanza la inspección del formato MIME al faltar FFprobe;
  devuelve `audio-validation-failed`, en lugar del `audio-mime-mismatch` que
  corresponde a un WAV real declarado incorrectamente como MPEG.
- La voz de emisión no puede ejecutar FFmpeg/Flite para generar el WAV: el audio
  permanece pendiente y el test termina encontrando `null` en lugar de `tts`.

Se corrigen las dependencias del job. Se mantienen las 205 pruebas, sus aserciones,
los tiempos de espera y la validación original de firmas, MIME, pistas, duración
y protocolos de audio/vídeo. No se sustituye ninguna prueba multimedia por mocks
ni se omiten pruebas cuando faltan los binarios.

## Reproducir las comprobaciones

En Ubuntu 24.04 con Node 22, desde la raíz:

```sh
sudo apt-get update
sudo apt-get install --yes --no-install-recommends ffmpeg
corepack enable
node scripts/check-media-tools.mjs
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

El script acepta `FFMPEG_PATH` y `FFPROBE_PATH` para diagnosticar instalaciones
personalizadas. El job utiliza los nombres predeterminados en PATH, también
necesarios para generar los fixtures de las pruebas. Los binarios sin Flite o
sin los codificadores necesarios fallan en la comprobación previa con un mensaje
explícito; no se aumenta el timeout para ocultar su ausencia.

Estas comprobaciones se han reproducido en un contenedor Ubuntu 24.04 limpio con
Node 22.23.4, pnpm 10.11.0 y FFmpeg/FFprobe 6.1.1: instalación con lockfile
congelado, comprobación multimedia, lint, tipos, 205 pruebas y compilación correctos.
Sin las herramientas multimedia se reproducen los cinco fallos originales; la
comprobación previa también falla correctamente con un diagnóstico de dependencia.

Los recorridos de navegador se ejecutan aparte con `pnpm test:e2e`; requieren
Chromium/Playwright y la aplicación compilada. La generación del HTML portátil
verifica la integridad de los originales y no incorpora datos privados de sesión.

La aprobación para fusionar debe basarse en el resultado de GitHub Actions del
commit exacto del PR, además de la reproducción local. Una ejecución local correcta
no demuestra que la ejecución remota haya terminado correctamente.

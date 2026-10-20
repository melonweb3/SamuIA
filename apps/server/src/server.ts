import { createMultiplatform } from './multiplatform-config';
import { multiplatformCommandSchema } from './multiplatform-commands';
import type { VoiceProvider } from '../../../packages/voice/src/index';
import type { ExternalChatMessage } from '../../../packages/shared/src/index';
import { createConfiguredLiveSession } from './live-config';
import type { LiveDataSession } from '../../../packages/live-data/src/index';
import { createServer, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { ReactionDirector } from '../../../packages/core/src/index';
import { commandSchema } from './commands';
export function createStudioServer(
  options: {
    live?: LiveDataSession;
    multiplatformFactory?: (
      receive: (message: ExternalChatMessage) => void,
    ) => ReturnType<typeof createMultiplatform>;
  } = {},
) {
  const simulation = new ReactionDirector();
  const live = options.live ?? createConfiguredLiveSession();
  let director = simulation;
  const multi = (options.multiplatformFactory ?? createMultiplatform)((message) =>
    director.receiveExternalChat(message),
  );
  const originalVoices = new Map<ReactionDirector, VoiceProvider>();
  const syncVoice = () => {
    if (multi.broadcast.running && multi.voice) {
      if (!originalVoices.has(director)) {
        originalVoices.set(director, director.voice);
        director.setVoiceProvider(multi.voice);
      }
    } else
      for (const [owner, voice] of originalVoices) {
        owner.setVoiceProvider(voice);
        originalVoices.delete(owner);
      }
  };
  const snapshot = () => ({
    ...(director === live.director ? live.snapshot() : director.snapshot()),
    multiplatform: {
      chats: multi.chats.snapshot(),
      broadcast: multi.broadcast.snapshot(multi.voice?.readyId() ?? null),
    },
  });
  const clients = new Set<ServerResponse>(),
    root = resolve('apps/studio/dist');
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(value));
  };
  const broadcast = () => {
    if (!clients.size) return;
    const data = `data: ${JSON.stringify(snapshot())}\n\n`;
    for (const client of clients)
      if (client.writableLength > 1000000) {
        clients.delete(client);
        client.end();
      } else client.write(data);
  };
  const timer = setInterval(() => {
    if (director === live.director) live.tick();
    else director.tick();
    multi.chats.tick();
    multi.broadcast.tick();
    syncVoice();
    if (
      !director.busy &&
      director.state === 'IDLE' &&
      !director.pendingChatId &&
      !director.chat.selectedId &&
      !director.scheduler.sportsEventQueue.length &&
      director.profile.communityInteractionLevel > 0
    ) {
      const message = director.chat.pending().find((m) => m.external && m.priority >= 30);
      if (message) director.command({ type: 'respond', id: message.id });
    }
    broadcast();
  }, 250);
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (req.method === 'POST' && path === '/api/webhooks/kick') {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 131072) return json(res, 413, { error: 'Webhook demasiado grande' });
          chunks.push(Buffer.from(chunk));
        }
        return json(res, multi.receiveKick(req.headers, Buffer.concat(chunks)) ? 202 : 401, {
          ok: true,
        });
      }
      if (req.method === 'GET' && path === '/api/broadcast/audio') {
        const lease = req.headers['x-broadcast-session'];
        if (typeof lease !== 'string' || !multi.broadcast.authorized(lease))
          return json(res, 403, { error: 'Sesión de emisión no válida' });
        const id = new URL(req.url!, 'http://localhost').searchParams.get('id') ?? '';
        const audio = multi.voice?.audio(id);
        if (!audio) return json(res, 404, { error: 'Audio no preparado' });
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
        res.end(audio);
        return;
      }
      if (
        req.method === 'POST' &&
        ['/api/broadcast/media', '/api/multiplatform/command'].includes(path)
      ) {
        if (req.headers.origin) {
          const origin = new URL(req.headers.origin);
          if (
            origin.host !== req.headers.host &&
            !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
          )
            return json(res, 403, { error: 'Origen no permitido' });
        }
        const media = path === '/api/broadcast/media',
          limit = media ? 4 * 1024 * 1024 : 16384;
        if (!req.headers['content-type']?.startsWith(media ? 'video/webm' : 'application/json'))
          return json(res, 415, { error: 'Tipo de contenido no válido' });
        if (media) {
          const lease = req.headers['x-broadcast-session'];
          if (typeof lease !== 'string' || !multi.broadcast.authorized(lease))
            return json(res, 403, { error: 'Sesión de vídeo obsoleta' });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > limit) return json(res, 413, { error: 'Solicitud demasiado grande' });
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);
        if (media) {
          const composition = new URL(req.url!, 'http://localhost').searchParams.get('composition');
          if (composition !== 'landscape' && composition !== 'portrait')
            return json(res, 400, { error: 'Formato no válido' });
          multi.broadcast.ingest(req.headers['x-broadcast-session'] as string, composition, body);
          return json(res, 202, { ok: true });
        }
        const parsed = multiplatformCommandSchema.safeParse(JSON.parse(body.toString('utf8')));
        if (!parsed.success) return json(res, 400, { error: 'Comando de administración inválido' });
        const command = parsed.data;
        switch (command.action) {
          case 'chat':
            multi.chats.enable(command.platform, command.enabled);
            break;
          case 'output':
            multi.broadcast.enable(command.platform, command.enabled);
            break;
          case 'start': {
            if (!command.preview && !multi.voice)
              return json(res, 409, {
                error:
                  'Configura una voz capturable en el servidor. BROADCAST_TTS=flite habilita una voz local de prueba',
              });
            const result = multi.broadcast.start(Date.now(), command.preview);
            syncVoice();
            broadcast();
            return json(res, 200, result);
          }
          case 'stop':
            if (command.sessionId && !multi.broadcast.authorized(command.sessionId))
              return json(res, 409, { error: 'La sesión de emisión ya terminó' });
            multi.broadcast.stop();
            syncVoice();
            break;
          case 'metadata':
            await multi.broadcast.metadata(command.platform, command.title, command.category);
            break;
          case 'voice':
            if (!multi.broadcast.authorized(command.sessionId))
              return json(res, 403, { error: 'Sesión no válida' });
            if (!multi.voice?.acknowledge(command.id, command.event, command.positionMs))
              return json(res, 409, { error: 'Frase obsoleta' });
            director.tick();
            break;
          case 'simulate-chat': {
            if (director.dataMode !== 'SIMULATION')
              return json(res, 409, { error: 'Las pruebas de chat están en SIMULATION' });
            director.receiveExternalChat({
              platform: command.platform,
              id: crypto.randomUUID(),
              liveId: 'simulation-demo',
              userId: command.username,
              username: command.username,
              message: command.message,
              timestamp: Date.now(),
              receivedAt: Date.now(),
              isBot: command.isBot,
              simulated: true,
            });
            break;
          }
        }
        broadcast();
        return json(res, 200, snapshot());
      }
      if (req.method === 'GET' && path === '/api/health')
        return json(res, 200, {
          ok: true,
          mode: director.dataMode,
          provider: director === simulation ? 'local-mock' : live.diagnostics.provider,
        });
      if (req.method === 'GET' && path === '/api/state') return json(res, 200, snapshot());
      if (req.method === 'GET' && path === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (req.method === 'POST' && path === '/api/command') {
        if (!req.headers['content-type']?.startsWith('application/json'))
          return json(res, 415, { error: 'Se requiere application/json' });
        if (req.headers.origin) {
          const origin = new URL(req.headers.origin);
          if (
            !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
            origin.host !== req.headers.host
          )
            return json(res, 403, { error: 'Origen no permitido' });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 16384) return json(res, 413, { error: 'Solicitud demasiado grande' });
          chunks.push(Buffer.from(chunk));
        }
        const parsed = commandSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        if (!parsed.success)
          return json(res, 400, {
            error: 'Comando inválido',
            details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
          });
        const command = parsed.data;
        if (command.type === 'data-mode') {
          const target = command.mode === 'LIVE' ? live.director : simulation;
          if (target !== director) {
            const settings = structuredClone(director.settings),
              profile = structuredClone(director.profile);
            if (director === live.director) live.pause();
            else director.command({ type: 'control', action: 'silence' });
            if (originalVoices.has(director)) {
              director.setVoiceProvider(originalVoices.get(director)!);
              originalVoices.delete(director);
            }
            director = target;
            director.settings = settings;
            director.profile = profile;
            if (director === live.director) live.resume();
            syncVoice();
          }
        } else {
          if (
            director === live.director &&
            ['event', 'match-add', 'match-remove', 'match-status', 'avatar-simulate'].includes(
              command.type,
            )
          )
            return json(res, 409, {
              error:
                'Los datos LIVE solo los actualiza el proveedor. Cambia a SIMULATION para simular eventos',
            });
          if (director === live.director && command.type === 'comment' && !director.dataFresh)
            return json(res, 409, {
              error: 'Los datos LIVE están pendientes o desactualizados; espera a la reconexión',
            });
          director.command(command);
        }
        broadcast();
        return json(res, 200, snapshot());
      }
      if (path.startsWith('/api/')) return json(res, 404, { error: 'Ruta no encontrada' });
      if (!['GET', 'HEAD'].includes(req.method ?? ''))
        return json(res, 405, { error: 'Método no permitido' });
      let file = resolve(root, '.' + decodeURIComponent(path));
      if (file !== root && !file.startsWith(root + sep))
        return json(res, 403, { error: 'Ruta no permitida' });
      try {
        if (!(await stat(file)).isFile()) file = resolve(root, 'index.html');
      } catch {
        if (extname(path)) return json(res, 404, { error: 'Recurso no encontrado' });
        file = resolve(root, 'index.html');
      }
      const bytes = await readFile(file);
      const mime: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) {
      if (!res.headersSent)
        json(res, e instanceof SyntaxError ? 400 : 422, {
          error: e instanceof Error ? e.message : 'Error de solicitud',
        });
    }
  });
  const stop = () => {
    clearInterval(timer);
    live.pause();
    multi.chats.stop();
    multi.broadcast.stop();
    syncVoice();
    for (const client of clients) client.end();
    server.close();
  };
  server.on('close', () => clearInterval(timer));
  return { server, director: simulation, live, multi, stop };
}

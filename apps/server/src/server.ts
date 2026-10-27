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
import { VoiceStudioService } from './voice-studio';
import { voiceCommandSchema } from './voice-commands';
import { ReactionStudioService } from './reaction-studio';
export function createStudioServer(
  options: {
    live?: LiveDataSession;
    voiceStudio?: VoiceStudioService;
    reactionStudio?: ReactionStudioService;
    multiplatformFactory?: (
      receive: (message: ExternalChatMessage) => void,
    ) => ReturnType<typeof createMultiplatform>;
  } = {},
) {
  const simulation = new ReactionDirector();
  const live = options.live ?? createConfiguredLiveSession();
  let director = simulation;
  const voiceStudio = options.voiceStudio ?? new VoiceStudioService();
  const reactionStudio = options.reactionStudio ?? new ReactionStudioService();
  const applyAvatar = () => {
    reactionStudio.apply(simulation);
    reactionStudio.apply(live.director);
  };
  void reactionStudio.ready.then(applyAvatar);
  const multi = (options.multiplatformFactory ?? createMultiplatform)((message) =>
    director.receiveExternalChat(message),
  );
  const originalVoices = new Map<ReactionDirector, VoiceProvider>();
  let voiceCaptureActive = false;
  const broadcastVoice = () => (voiceStudio.capturable ? voiceStudio : multi.voice);
  const syncVoice = () => {
    if (voiceCaptureActive !== multi.broadcast.running && director.voice === voiceStudio)
      director.command({ type: 'control', action: 'silence' });
    voiceCaptureActive = multi.broadcast.running;
    voiceStudio.captureOnly = multi.broadcast.running;
    director.interruptVoiceEnabled = voiceStudio.enabled && voiceStudio.settings.interruptEnabled;
    const selected = multi.broadcast.running
      ? broadcastVoice()
      : voiceStudio.enabled
        ? voiceStudio
        : null;
    if (selected) {
      if (!originalVoices.has(director)) {
        originalVoices.set(director, director.voice);
      }
      if (director.voice !== selected) director.setVoiceProvider(selected);
    } else
      for (const [owner, voice] of originalVoices) {
        owner.setVoiceProvider(voice);
        originalVoices.delete(owner);
      }
  };
  const snapshot = () => ({
    ...(director === live.director ? live.snapshot() : director.snapshot()),
    voiceStudio: voiceStudio.snapshot(),
    ...reactionStudio.snapshot(),
    multiplatform: {
      chats: multi.chats.snapshot(),
      broadcast: {
        ...multi.broadcast.snapshot(broadcastVoice()?.readyId() ?? null),
        audioAvailable: !!broadcastVoice(),
      },
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
    voiceStudio.tick();
    if (director.profile.communityInteractionLevel > 0)
      director.respondToPendingChat(Date.now(), { externalOnly: true, minimumPriority: 30 });
    broadcast();
  }, 250);
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path.startsWith('/api/avatar/')) {
        await reactionStudio.ready;
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (req.headers.origin) {
          const origin = new URL(req.headers.origin);
          if (
            origin.host !== req.headers.host &&
            !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
          )
            return json(res, 403, { error: 'Origen no permitido' });
        }
        if (req.method === 'GET' && path === '/api/avatar/video') {
          const result = await reactionStudio.video(
            url.searchParams.get('id') ?? '',
            String(req.headers['x-avatar-session'] ?? ''),
          );
          res.writeHead(200, { 'Content-Type': result.mime, 'Cache-Control': 'no-store' });
          res.end(result.bytes);
          return;
        }
        if (req.method === 'POST' && path === '/api/avatar/private-session')
          return json(res, 200, { token: reactionStudio.session() });
        if (req.method !== 'POST' || !['/api/avatar/video', '/api/avatar/reference'].includes(path))
          return json(res, 404, { error: 'Ruta de avatar no encontrada' });
        const upload = path === '/api/avatar/video',
          chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > (upload ? 100 * 1024 * 1024 : 16384))
            return json(res, 413, { error: 'Archivo o comando demasiado grande' });
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);
        if (upload)
          await reactionStudio.upload(
            body,
            (req.headers['content-type'] ?? '').split(';')[0],
            JSON.parse(url.searchParams.get('metadata') ?? '{}'),
          );
        else {
          const cmd = JSON.parse(body.toString());
          if (typeof cmd.id !== 'string') return json(res, 400, { error: 'ID inválido' });
          if (cmd.action === 'delete') await reactionStudio.removeReference(cmd.id);
          else if (cmd.action === 'update') await reactionStudio.updateReference(cmd.id, cmd.patch);
          else return json(res, 400, { error: 'Acción de referencia inválida' });
          applyAvatar();
        }
        broadcast();
        return json(res, 200, snapshot());
      }
      if (path.startsWith('/api/voice/')) {
        await voiceStudio.ready;
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (req.headers.origin) {
          const origin = new URL(req.headers.origin);
          if (
            origin.host !== req.headers.host &&
            !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
          )
            return json(res, 403, { error: 'Origen no permitido' });
        }
        if (req.method === 'GET' && path === '/api/voice/state')
          return json(res, 200, voiceStudio.snapshot());
        if (req.method === 'GET' && path === '/api/voice/audio') {
          const token = req.headers['x-voice-session'];
          if (
            multi.broadcast.running ||
            typeof token !== 'string' ||
            !voiceStudio.authorized(token)
          )
            return json(res, 403, { error: 'Reproductor no autorizado' });
          const audio = voiceStudio.audio(url.searchParams.get('id') ?? '');
          if (!audio) return json(res, 404, { error: 'Audio no preparado' });
          res.writeHead(200, {
            'Content-Type': voiceStudio.audioMime(),
            'Cache-Control': 'no-store',
          });
          res.end(audio);
          return;
        }
        if (req.method !== 'POST' || !['/api/voice/command', '/api/voice/sample'].includes(path))
          return json(res, 404, { error: 'Ruta de voz no encontrada' });
        const sample = path === '/api/voice/sample',
          limit = sample ? 10 * 1024 * 1024 : 16384;
        if (!sample && !req.headers['content-type']?.startsWith('application/json'))
          return json(res, 415, { error: 'Se requiere application/json' });
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > limit) return json(res, 413, { error: 'Archivo o comando demasiado grande' });
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);
        if (sample) {
          const role = url.searchParams.get('role');
          if (role !== 'sample' && role !== 'consent')
            return json(res, 400, { error: 'Tipo de muestra inválido' });
          await voiceStudio.upload(
            url.searchParams.get('profileId') ?? '',
            role,
            body,
            (req.headers['content-type'] ?? '').split(';')[0],
          );
        } else {
          const parsed = voiceCommandSchema.safeParse(JSON.parse(body.toString('utf8')));
          if (!parsed.success) return json(res, 400, { error: 'Comando de voz inválido' });
          const cmd = parsed.data;
          switch (cmd.action) {
            case 'configure': {
              const before = voiceStudio.settings;
              await voiceStudio.configure(cmd.patch);
              if (
                before.voiceEnabled !== voiceStudio.settings.voiceEnabled ||
                before.defaultVoiceProfile !== voiceStudio.settings.defaultVoiceProfile ||
                before.fallbackVoice !== voiceStudio.settings.fallbackVoice
              )
                director.command({ type: 'control', action: 'silence' });
              syncVoice();
              break;
            }
            case 'profile':
              await voiceStudio.createProfile(cmd.name, cmd.provider);
              break;
            case 'create':
              await voiceStudio.createCustom(cmd.id, cmd.ownVoice);
              break;
            case 'verify':
              await voiceStudio.verify(cmd.id);
              break;
            case 'remove':
              await voiceStudio.remove(cmd.id);
              director.command({ type: 'control', action: 'silence' });
              syncVoice();
              break;
            case 'sample-delete':
              voiceStudio.deleteSample(cmd.id, cmd.role);
              break;
            case 'claim':
              if (multi.broadcast.running)
                return json(res, 409, { error: 'La emisión controla la salida de voz' });
              return json(res, 200, { token: voiceStudio.claim(cmd.token) });
            case 'release':
              if (voiceStudio.authorized(cmd.token) && !multi.broadcast.running)
                director.command({ type: 'control', action: 'silence' });
              voiceStudio.release(cmd.token);
              break;
            case 'playback':
              if (multi.broadcast.running || !voiceStudio.authorized(cmd.token))
                return json(res, 403, { error: 'Reproductor no autorizado' });
              if (
                !voiceStudio.acknowledge(
                  cmd.id,
                  cmd.event,
                  cmd.positionMs,
                  Date.now(),
                  cmd.durationMs,
                  cmd.audioLevel,
                )
              )
                return json(res, 409, { error: 'Frase obsoleta' });
              director.tick();
              break;
            case 'stop':
              director.command({ type: 'control', action: 'silence' });
              voiceStudio.cancelSpeech();
              break;
            case 'speak':
              if (!voiceStudio.enabled)
                return json(res, 409, { error: 'Activa la voz en Voice Studio antes de hablar' });
              syncVoice();
              director.operator(
                {
                  id: cmd.id ?? crypto.randomUUID(),
                  source: 'Operador · Voice Studio',
                  text: cmd.text,
                  emotion: cmd.emotion,
                  intensity: cmd.intensity,
                  priority: cmd.priority,
                  interruptible: cmd.priority !== 'CRITICAL',
                  timestamp: Date.now(),
                  matchId: cmd.matchId,
                  profileId: cmd.profileId,
                },
                cmd.interrupt,
              );
              break;
          }
        }
        broadcast();
        return json(res, 200, snapshot());
      }
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
        const audio = broadcastVoice()?.audio(id);
        if (!audio) return json(res, 404, { error: 'Audio no preparado' });
        res.writeHead(200, {
          'Content-Type':
            broadcastVoice() instanceof VoiceStudioService ? voiceStudio.audioMime() : 'audio/wav',
          'Cache-Control': 'no-store',
        });
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
            if (!command.preview && !broadcastVoice())
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
            if (
              !(broadcastVoice() instanceof VoiceStudioService
                ? voiceStudio.acknowledge(
                    command.id,
                    command.event,
                    command.positionMs,
                    Date.now(),
                    command.durationMs,
                    command.audioLevel,
                  )
                : broadcastVoice()?.acknowledge(command.id, command.event, command.positionMs))
            )
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
        await reactionStudio.ready;
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
          if (
            command.type === 'reaction-upsert' &&
            command.asset.videoReferenceId &&
            !reactionStudio
              .snapshot()
              .motionReferences.some((r) => r.id === command.asset.videoReferenceId)
          )
            return json(res, 400, { error: 'La referencia vinculada no existe' });
          director.command(command);
          if (['avatar-settings', 'reaction-upsert', 'reaction-remove'].includes(command.type)) {
            await reactionStudio.capture(director);
            applyAvatar();
          }
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
    voiceStudio.stop();
    syncVoice();
    for (const client of clients) client.end();
    server.close();
  };
  server.on('close', () => clearInterval(timer));
  return { server, director: simulation, live, multi, stop };
}

import { createServer, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { ReactionDirector } from '../../../packages/core/src/index';
import { commandSchema } from './commands';
export function createStudioServer() {
  const director = new ReactionDirector(),
    clients = new Set<ServerResponse>(),
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
    const data = `data: ${JSON.stringify(director.snapshot())}\n\n`;
    for (const client of clients)
      if (client.writableLength > 1000000) {
        clients.delete(client);
        client.end();
      } else client.write(data);
  };
  const timer = setInterval(() => {
    director.tick();
    broadcast();
  }, 250);
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/health')
        return json(res, 200, { ok: true, mode: 'DEMO', provider: 'local-mock' });
      if (req.method === 'GET' && path === '/api/state') return json(res, 200, director.snapshot());
      if (req.method === 'GET' && path === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify(director.snapshot())}\n\n`);
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
        director.command(parsed.data);
        broadcast();
        return json(res, 200, director.snapshot());
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
    for (const client of clients) client.end();
    server.close();
  };
  server.on('close', () => clearInterval(timer));
  return { server, director, stop };
}

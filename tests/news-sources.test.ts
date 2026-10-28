import { it, expect, vi } from 'vitest';
import {
  publicAddress,
  validateNewsDestination,
  parseNewsFeed,
  NewsSourceManager,
} from '../apps/server/src/news-sources';
import type { NewsSource } from '../packages/shared/src/news';
const now = Date.now();
const source: NewsSource = {
  id: 'rss',
  name: 'Medio',
  url: 'https://publisher.org/feed',
  kind: 'rss',
  category: 'España',
  enabled: true,
  usage: 'headlines',
  termsUrl: 'https://publisher.org/terms',
  termsNote: 'Permiso ficticio de fixture para las pruebas, no una licencia real.',
};
const rss = `<rss version="2.0"><channel><item><title>Noticia publicada</title><link>https://publisher.org/article</link><pubDate>${new Date(now).toUTCString()}</pubDate><description>Extracto autorizado</description></item></channel></rss>`;
it.each([
  '127.0.0.1',
  '10.0.0.1',
  '172.16.0.1',
  '169.254.169.254',
  '192.168.0.1',
  '100.64.0.1',
  '0.0.0.0',
  '224.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'fc00::1',
  'fe80::1',
  '2001:db8::1',
])('rechaza dirección reservada %s', (ip) => expect(publicAddress(ip)).toBe(false));
it('solo admite destinos HTTPS autorizados que resuelvan íntegramente a direcciones públicas', async () => {
  const resolver = vi.fn(async () => ['8.8.8.8']);
  for (const url of [
    'http://publisher.org/feed',
    'https://127.0.0.1',
    'https://[::1]/',
    'https://a:b@publisher.org/',
    'https://publisher.org:8443/',
    'https://localhost/',
    'https://metadata.internal/',
  ])
    await expect(validateNewsDestination(url, ['publisher.org'], resolver)).rejects.toThrow();
  await expect(validateNewsDestination(source.url, [], resolver)).rejects.toThrow(/autorizado/);
  await expect(
    validateNewsDestination(source.url, ['publisher.org'], async () => ['8.8.8.8', '10.0.0.1']),
  ).rejects.toThrow(/interna/);
  expect((await validateNewsDestination(source.url, ['publisher.org'], resolver)).hostname).toBe(
    'publisher.org',
  );
});
it('lee RSS y conserva fuente, enlace, fecha y permiso de extractos', () => {
  const items = parseNewsFeed(rss, source, now);
  expect(items[0]).toMatchObject({
    title: 'Noticia publicada',
    sourceName: 'Medio',
    sourceId: 'rss',
    summary: '',
    url: 'https://publisher.org/article',
    simulated: false,
  });
  expect(items[0].publishedAt).toBeLessThanOrEqual(now);
  expect(parseNewsFeed(rss, { ...source, usage: 'licensed-excerpts' }, now)[0].summary).toBe(
    'Extracto autorizado',
  );
});
it('admite Atom y API JSON normalizada sin ejecutar HTML ni cargar imágenes', () => {
  const atom = `<feed><entry><title>Noticia Atom</title><link href="https://publisher.org/atom"/><updated>${new Date(now).toISOString()}</updated><summary>&lt;img src="https://evil.org/a"/&gt;Texto</summary></entry></feed>`;
  expect(parseNewsFeed(atom, source, now)[0].title).toBe('Noticia Atom');
  const json = JSON.stringify([
    {
      title: 'API',
      url: 'https://publisher.org/api',
      publishedAt: new Date(now).toISOString(),
      summary: 'Resumen',
    },
  ]);
  expect(parseNewsFeed(json, { ...source, kind: 'json' }, now)[0].title).toBe('API');
});
it('rechaza XML mal formado, DTD y fechas ausentes, futuras o enlaces inseguros', () => {
  expect(() =>
    parseNewsFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', source, now),
  ).toThrow(/DTD/);
  expect(() => parseNewsFeed('<rss><channel></rss>', source, now)).toThrow();
  expect(
    parseNewsFeed(
      '<rss><channel><item><title>Sin fecha</title><link>https://publisher.org/a</link></item></channel></rss>',
      source,
      now,
    ),
  ).toEqual([]);
  expect(
    parseNewsFeed(
      rss.replace('https://publisher.org/article', 'http://127.0.0.1/private'),
      source,
      now,
    ),
  ).toEqual([]);
});
it('no sigue redirecciones y las credenciales solo se envían al dominio configurado', async () => {
  const fetcher = vi.fn(async (_url: URL | RequestInfo, options?: RequestInit) => {
    expect(options?.redirect).toBe('error');
    return new Response(rss);
  }) as unknown as typeof fetch;
  const receive = vi.fn();
  const manager = new NewsSourceManager(
    receive,
    {
      NEWS_ALLOWED_HOSTS: 'publisher.org',
      NEWS_API_HOST: 'other.org',
      NEWS_API_KEY: 'private-value',
    },
    fetcher,
    async () => ['8.8.8.8'],
  );
  manager.add({
    name: source.name,
    url: source.url,
    kind: source.kind,
    category: source.category,
    enabled: true,
    usage: source.usage,
    termsUrl: source.termsUrl,
    termsNote: source.termsNote,
  });
  await manager.refresh(now);
  expect(receive).toHaveBeenCalledOnce();
  expect(JSON.stringify(vi.mocked(fetcher).mock.calls[0][1])).not.toContain('private-value');
  expect(JSON.stringify(manager.sources)).not.toContain('private-value');
});
it('dominios no autorizados y respuestas excesivas fallan sin filtrar errores ni llamar al receptor', async () => {
  const fetcher = vi.fn(
    async () => new Response('x'.repeat(1024 * 1024 + 1)),
  ) as unknown as typeof fetch;
  const receive = vi.fn();
  const manager = new NewsSourceManager(
    receive,
    { NEWS_ALLOWED_HOSTS: 'publisher.org' },
    fetcher,
    async () => ['8.8.8.8'],
  );
  const { id: unused, ...config } = source;
  void unused;
  manager.add(config);
  await manager.refresh(now);
  expect(receive).not.toHaveBeenCalled();
  expect(manager.sources[0].error).toContain('No se pudo');
  manager.enable(manager.sources[0].id, false);
});
it('exige autorización al añadir y documenta permisos de extractos; registra actualizaciones', async () => {
  const manager = new NewsSourceManager(
    () => {},
    { NEWS_ALLOWED_HOSTS: 'publisher.org' },
    (async () => new Response(rss)) as typeof fetch,
    async () => ['8.8.8.8'],
  );
  const config = {
    name: 'Medio',
    url: source.url,
    kind: 'rss',
    category: 'España',
    enabled: true,
    usage: 'licensed-excerpts',
  };
  expect(() => manager.add({ ...config, url: 'https://unauthorized.org/rss' })).toThrow(
    /autorizado/,
  );
  expect(() => manager.add(config)).toThrow(/condiciones/);
  manager.add({
    ...config,
    termsUrl: 'https://publisher.org/terms',
    termsNote: 'Permiso editorial registrado para utilizar extractos en el programa.',
  });
  await manager.refresh(now);
  expect(manager.history[0]).toMatchObject({ ok: true, received: 1 });
});

import { newsFetch } from './news-http';
import { readFileSync } from 'node:fs';
import { classifyNews } from '../../../packages/news/src/index';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import {
  newsCategorySelected,
  newsCategories,
  type NewsSource,
  type NewsItem,
} from '../../../packages/shared/src/news';
import { id } from '../../../packages/shared/src/index';
export const newsSourceSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    url: z.string().url().max(2000),
    kind: z.enum(['rss', 'json']),
    category: z.enum(newsCategories),
    enabled: z.boolean(),
    usage: z.enum(['headlines', 'licensed-excerpts']),
    termsUrl: z.string().url().max(2000).optional(),
    termsNote: z.string().trim().max(1000).optional(),
  })
  .strict();
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:/i.test(address);
}
export async function validateNewsDestination(
  raw: string,
  allowed: string[],
  resolve = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address),
) {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    url.hash ||
    isIP(url.hostname.replaceAll('[', '').replaceAll(']', '')) ||
    !url.hostname.includes('.') ||
    /\.(localhost|local|internal|invalid|test|example)$/i.test(url.hostname)
  )
    throw Error(
      'La fuente requiere un destino HTTPS público sin credenciales ni puertos especiales.',
    );
  if (!allowed.includes(url.hostname.toLowerCase()))
    throw Error('El dominio no está autorizado en NEWS_ALLOWED_HOSTS del servidor.');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      resolve(url.hostname),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(Error('No se pudo validar el destino DNS.')), 5000);
      }),
    ]);
    if (!addresses.length || addresses.some((a) => !publicAddress(a)))
      throw Error('La fuente resuelve a una dirección interna o reservada.');
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return url;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const list = (v: unknown) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const clean = (v: unknown, max: number) =>
  String(typeof v === 'object' ? (record(v)['#text'] ?? '') : (v ?? ''))
    .replace(
      /&(lt|gt|amp|quot|apos);/g,
      (_, name: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[name] ?? '',
    )
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
/** Read metadata/excerpts only; no remote image or full article download. */
export function parseNewsFeed(body: string, source: NewsSource, now: number): NewsItem[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(body))
    throw Error('DTD y entidades externas no están permitidas.');
  let rows: unknown[];
  if (source.kind === 'json') {
    const data: unknown = JSON.parse(body);
    rows = Array.isArray(data) ? data : list(record(data).items);
  } else {
    if (XMLValidator.validate(body) !== true) throw Error('RSS/Atom no válido.');
    const data = record(
      new XMLParser({
        ignoreAttributes: false,
        processEntities: false,
        parseTagValue: false,
      }).parse(body),
    );
    rows = data.rss ? list(record(record(data.rss).channel).item) : list(record(data.feed).entry);
  }
  if (rows.length > 500) throw Error('La fuente supera el límite de noticias.');
  return rows.flatMap((raw) => {
    const r = record(raw),
      links = list(r.link);
    const atom = links.map(record).find((l) => l['@_rel'] === 'alternate' || !l['@_rel']);
    const href =
      source.kind === 'json' ? r.url : typeof r.link === 'string' ? r.link : atom?.['@_href'];
    const title = clean(r.title, 250),
      summary = source.usage === 'licensed-excerpts' ? clean(r.summary ?? r.description, 800) : '';
    const publishedAt = Date.parse(
      clean(r.publishedAt ?? r.pubDate ?? r.published ?? r.updated, 100),
    );
    if (!title || !href || !Number.isFinite(publishedAt) || publishedAt > now + 300000) return [];
    let url: URL;
    try {
      url = new URL(String(href), source.url);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        isIP(url.hostname.replaceAll('[', '').replaceAll(']', '')) ||
        !url.hostname.includes('.') ||
        /\.(local|internal|localhost|invalid|test|example)$/i.test(url.hostname)
      )
        return [];
    } catch {
      return [];
    }
    return [
      {
        id: id(),
        sourceId: source.id,
        sourceName: source.name,
        url: url.toString(),
        publishedAt,
        title,
        summary,
        category: classifyNews(`${title} ${summary}`, source.category),
        simulated: false,
      },
    ];
  });
}
export class NewsSourceManager {
  readonly sources: NewsSource[] = [];
  history: { at: number; sourceId: string; received: number; ok: boolean }[] = [];
  refreshSeconds = 60;
  private refreshing = false;
  private pending: Promise<void> | null = null;
  private nextAt = 0;
  constructor(
    private receive: (items: NewsItem[], now: number) => void,
    private env: NodeJS.ProcessEnv = process.env,
    private fetcher: typeof fetch = newsFetch,
    private resolver?: (host: string) => Promise<string[]>,
  ) {
    this.refreshSeconds = Math.max(60, Math.min(3600, Number(env.NEWS_REFRESH_SECONDS) || 60));
  }
  loadCatalog() {
    if (!this.env.NEWS_SOURCE_CATALOG_FILE) return;
    const values = z
      .array(newsSourceSchema)
      .max(30)
      .parse(JSON.parse(readFileSync(this.env.NEWS_SOURCE_CATALOG_FILE, 'utf8')));
    for (const value of values) {
      if (!this.sources.some((s) => s.url === value.url)) this.add({ ...value, enabled: false });
    }
  }
  add(value: unknown) {
    const config = newsSourceSchema.parse(value);
    const u = new URL(config.url);
    if (
      [...u.searchParams.keys()].some(
        (k) => !['category', 'page', 'limit', 'lang', 'format'].includes(k),
      )
    )
      throw Error(
        'Los parámetros de la fuente no están admitidos. Configura credenciales solo en el servidor.',
      );
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.hash ||
      u.port ||
      isIP(u.hostname.replaceAll('[', '').replaceAll(']', ''))
    )
      throw Error('Solo se admiten fuentes HTTPS sin credenciales ni IP literal.');
    const allowed = (this.env.NEWS_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase());
    if (!allowed.includes(u.hostname.toLowerCase()))
      throw Error('El dominio no está autorizado en NEWS_ALLOWED_HOSTS del servidor.');
    if (!config.termsUrl || !config.termsNote || config.termsNote.length < 20)
      throw Error(
        'Registra el enlace a las condiciones y la comprobación del permiso de reutilización antes de añadir la fuente.',
      );
    if (config.termsUrl && new URL(config.termsUrl).protocol !== 'https:')
      throw Error('Las condiciones requieren un enlace HTTPS.');
    if (this.sources.length >= 30 || this.sources.some((s) => s.url === u.toString()))
      throw Error('Fuente duplicada o límite de fuentes alcanzado.');
    this.sources.push({ ...config, url: u.toString(), id: id() });
  }
  enable(id: string, enabled: boolean) {
    const source = this.sources.find((s) => s.id === id);
    if (!source) throw Error('Fuente no encontrada');
    source.enabled = enabled;
  }
  tick(now = Date.now(), categories: readonly string[] = newsCategories) {
    if (now >= this.nextAt && !this.refreshing) {
      this.nextAt = now + this.refreshSeconds * 1000;
      void this.refresh(now, categories);
    }
  }
  refresh(now = Date.now(), categories: readonly string[] = newsCategories): Promise<void> {
    if (this.pending) return this.pending.then(() => this.refresh(now, categories));
    this.pending = this.runRefresh(now, categories).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  private async runRefresh(now: number, categories: readonly string[]) {
    this.refreshing = true;
    try {
      for (const source of this.sources.filter(
        (s) => s.enabled && newsCategorySelected(categories, s.category),
      )) {
        try {
          const allowed = (this.env.NEWS_ALLOWED_HOSTS ?? '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          if (!source.termsUrl || !source.termsNote || source.termsNote.length < 20)
            throw Error('terms-not-reviewed');
          const url = await validateNewsDestination(source.url, allowed, this.resolver);
          const headers: Record<string, string> = {
            Accept:
              source.kind === 'rss'
                ? 'application/rss+xml, application/atom+xml, application/xml'
                : 'application/json',
          };
          if (this.env.NEWS_API_KEY && this.env.NEWS_API_HOST === url.hostname)
            headers.Authorization = `Bearer ${this.env.NEWS_API_KEY}`;
          const response = await this.fetcher(url, {
            headers,
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw Error('La fuente rechazó la petición.');
          const reader = response.body?.getReader();
          if (!reader) throw Error('Fuente sin contenido.');
          const chunks: Uint8Array[] = [];
          let length = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              length += value.length;
              if (length > 1024 * 1024) throw Error('Fuente demasiado grande.');
              chunks.push(value);
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const c of chunks) {
            bytes.set(c, offset);
            offset += c.length;
          }
          if (!source.enabled) continue;
          const items = parseNewsFeed(new TextDecoder().decode(bytes), source, now);
          this.receive(items, now);
          this.history.unshift({ at: now, sourceId: source.id, received: items.length, ok: true });
          source.lastFetchedAt = now;
          delete source.error;
        } catch {
          this.history.unshift({ at: now, sourceId: source.id, received: 0, ok: false });
          source.error =
            'No se pudo leer la fuente. Revisa HTTPS, autorización del dominio, DNS público, formato y permisos de uso.';
        }
      }
    } finally {
      this.history = this.history.slice(0, 100);
      this.refreshing = false;
    }
  }
}

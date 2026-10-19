import type { MatchDataProvider, LiveCommentaryProvider } from './contracts';
import { parseMatches, parseIncidents } from './normalize';
import type { LiveMatchRecord } from '../../shared/src/index';
export class ProviderHttpError extends Error {
  constructor(
    public status: number,
    public retryAfterMs = 0,
  ) {
    super(`Proveedor HTTP ${status}`);
  }
}
export async function fetchJson(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, { headers, signal, redirect: 'error' });
  if (!response.ok) {
    const retry = response.headers.get('retry-after');
    const ms =
      retry && /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : retry
          ? Math.max(0, Date.parse(retry) - Date.now())
          : 0;
    throw new ProviderHttpError(response.status, Math.min(300000, ms || 0));
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Respuesta sin cuerpo');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) throw new Error('Respuesta LIVE demasiado grande');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export class HttpMatchDataProvider implements MatchDataProvider {
  readonly name = 'HTTP JSON normalizado';
  constructor(
    private url: string,
    private headers: Record<string, string> = {},
  ) {}
  async getMatches(signal: AbortSignal) {
    return parseMatches(await fetchJson(this.url, this.headers, signal), this.name, Date.now());
  }
}
export class HttpLiveCommentaryProvider implements LiveCommentaryProvider {
  readonly name = 'HTTP narración';
  constructor(
    private url: string,
    private headers: Record<string, string> = {},
  ) {}
  async getCommentary(_matches: LiveMatchRecord[], signal: AbortSignal) {
    void _matches;
    const value = await fetchJson(this.url, this.headers, signal);
    if (!Array.isArray(value)) throw new Error('Lista de narración inválida');
    return parseIncidents(
      value.map((i) => ({ ...i, channel: 'commentary' })),
      this.name,
      Date.now(),
    );
  }
}

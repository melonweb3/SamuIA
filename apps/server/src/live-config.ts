import { LiveDataSession } from '../../../packages/live-data/src/index';
import {
  HttpMatchDataProvider,
  HttpLiveCommentaryProvider,
} from '../../../packages/live-data/src/http';
import { ApiFootballMatchDataProvider } from '../../../integrations/sports/src/api-football';
export function createConfiguredLiveSession(env: NodeJS.ProcessEnv = process.env) {
  const url = (value: string | undefined) => {
    if (!value) throw new Error('Falta URL LIVE');
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.hash)
      throw new Error('URL LIVE inválida');
    return u.toString();
  };
  try {
    const pollMs = Number(env.LIVE_POLL_MS ?? 15000),
      timeoutMs = Number(env.LIVE_TIMEOUT_MS ?? 12000);
    if (
      !Number.isFinite(pollMs) ||
      pollMs < 1000 ||
      pollMs > 300000 ||
      !Number.isFinite(timeoutMs) ||
      timeoutMs < 500 ||
      timeoutMs > 60000
    )
      throw new Error('Intervalos LIVE inválidos');
    const headers: Record<string, string> = env.FOOTBALL_API_KEY
      ? { Authorization: `Bearer ${env.FOOTBALL_API_KEY}` }
      : {};
    let matches = null;
    if (env.FOOTBALL_PROVIDER === 'http-json')
      matches = new HttpMatchDataProvider(url(env.FOOTBALL_MATCHES_URL), headers);
    else if (env.FOOTBALL_PROVIDER === 'api-football') {
      if (!env.FOOTBALL_API_KEY) throw new Error('Falta clave LIVE');
      const ids = (env.FOOTBALL_MATCH_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 20 || ids.some((id) => !/^\d+$/.test(id)))
        throw new Error('IDs LIVE inválidos');
      matches = new ApiFootballMatchDataProvider(env.FOOTBALL_API_KEY, ids);
    } else if (env.FOOTBALL_PROVIDER && env.FOOTBALL_PROVIDER !== 'none')
      throw new Error('Proveedor LIVE inválido');
    const commentary = env.FOOTBALL_COMMENTARY_URL
      ? new HttpLiveCommentaryProvider(
          url(env.FOOTBALL_COMMENTARY_URL),
          env.FOOTBALL_COMMENTARY_API_KEY
            ? { Authorization: `Bearer ${env.FOOTBALL_COMMENTARY_API_KEY}` }
            : {},
        )
      : null;
    return new LiveDataSession(matches, commentary, { pollMs, timeoutMs });
  } catch {
    const session = new LiveDataSession(null);
    session.diagnostics.message =
      'Configuración LIVE incompleta o inválida. Revisa las variables de entorno del servidor';
    return session;
  }
}

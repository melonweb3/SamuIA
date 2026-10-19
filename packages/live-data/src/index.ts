import { ReactionDirector } from '../../core/src/index';
import {
  normalize,
  type LiveDiagnostics,
  type LiveIncident,
  type LiveMatchRecord,
} from '../../shared/src/index';
import type { MatchDataProvider, LiveCommentaryProvider } from './contracts';
import { ProviderHttpError } from './http';
export * from './contracts';
export * from './normalize';
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('LIVE timeout or cancelled'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
interface Seen {
  incident: LiveIncident;
  channels: Set<string>;
  queued: boolean;
  baseline: boolean;
  firstAt: number;
}
const family = (kind: LiveIncident['kind']) =>
  ['chance', 'shot', 'save', 'missed_chance'].includes(kind) ? 'attempt' : kind;
export class LiveDataSession {
  readonly director: ReactionDirector;
  diagnostics: LiveDiagnostics;
  private seen = new Map<string, Seen>();
  private initialized = new Set<string>();
  private pending = new Set<Seen>();
  private active = false;
  private polling = false;
  private generation = 0;
  private abort: AbortController | null = null;
  private commentaryNextAt = 0;
  private commentaryFailures = 0;
  constructor(
    private matches: MatchDataProvider | null,
    private commentary: LiveCommentaryProvider | null = null,
    private options: {
      pollMs?: number;
      timeoutMs?: number;
      mergeMs?: number;
      staleMs?: number;
    } = {},
    now = Date.now(),
  ) {
    this.director = new ReactionDirector(now, false, { matches: [], advanceMinutes: false });
    this.director.dataMode = 'LIVE';
    this.director.dataFresh = false;
    this.diagnostics = {
      status: matches ? 'paused' : 'unconfigured',
      provider: matches?.name ?? 'Sin proveedor',
      commentary: commentary ? 'reconnecting' : 'events-fallback',
      lastSuccessAt: null,
      nextRetryAt: null,
      failures: 0,
      stale: true,
      duplicates: 0,
      message: matches
        ? 'LIVE listo para conectar'
        : 'Configura el proveedor LIVE en las variables de entorno del servidor',
      logs: [],
    };
  }
  private log(code: string, level: 'info' | 'warn' | 'error', now: number, matchId?: string) {
    this.diagnostics.logs.unshift({ at: now, level, code, ...(matchId ? { matchId } : {}) });
    this.diagnostics.logs = this.diagnostics.logs.slice(0, 100);
  }
  resume(now = Date.now()) {
    this.active = true;
    this.diagnostics.nextRetryAt = now;
    if (this.matches) this.diagnostics.status = 'connecting';
  }
  pause(now = Date.now()) {
    this.active = false;
    ++this.generation;
    this.abort?.abort();
    this.director.command({ type: 'control', action: 'silence' }, now);
    if (this.matches) this.diagnostics.status = 'paused';
    this.diagnostics.nextRetryAt = null;
    this.director.dataFresh = false;
  }
  tick(now = Date.now()) {
    if (!this.active) return;
    this.diagnostics.stale =
      this.diagnostics.lastSuccessAt === null ||
      now - this.diagnostics.lastSuccessAt > (this.options.staleMs ?? 45000);
    for (const item of this.pending)
      if (now - item.firstAt >= (this.options.mergeMs ?? 1500)) {
        this.pending.delete(item);
        if (!item.baseline) {
          const announce = now - item.incident.receivedAt < 180000;
          if (announce) this.director.queueLiveIncident(item.incident);
          item.queued = true;
          this.log(
            announce ? 'incident-queued' : 'incident-archived-late',
            'info',
            now,
            item.incident.matchId,
          );
        }
      }
    this.director.dataFresh =
      !this.diagnostics.stale && this.diagnostics.status === 'connected' && this.pending.size === 0;
    this.director.tick(now);
    if (
      this.director.dataFresh &&
      !this.director.busy &&
      this.director.state === 'IDLE' &&
      !this.director.pendingChatId &&
      !this.director.chat.selectedId &&
      !this.director.scheduler.sportsEventQueue.length &&
      this.director.profile.communityInteractionLevel > 0
    ) {
      const message = this.director.chat.messages.find((m) => m.status === 'pending');
      if (message) this.director.command({ type: 'respond', id: message.id }, now);
    }
    if (!this.polling && this.matches && now >= (this.diagnostics.nextRetryAt ?? 0))
      void this.poll(now);
  }
  async poll(now = Date.now()) {
    if (!this.active || this.polling || !this.matches || now < (this.diagnostics.nextRetryAt ?? 0))
      return;
    this.polling = true;
    const generation = this.generation,
      abort = new AbortController();
    this.abort = abort;
    const timeout = setTimeout(() => abort.abort(), this.options.timeoutMs ?? 12000);
    try {
      const records = await abortable(this.matches.getMatches(abort.signal), abort.signal);
      if (generation !== this.generation || abort.signal.aborted) return;
      // Structured feed commits independently: a slow narration endpoint must not block the score.
      const eligible: LiveMatchRecord[] = [];
      const baselineIds = new Set<string>();
      for (const record of records) {
        const previous = this.director.manager.activeMatches.find((m) => m.id === record.id);
        const previousStatus = previous?.status;
        if (this.director.applyLiveMatch(record, now)) {
          eligible.push(record);
          const phase =
            previousStatus === 'upcoming' && record.status === 'live'
              ? 'kickoff'
              : previousStatus === 'live' && record.status === 'halftime'
                ? 'halftime'
                : previousStatus === 'halftime' && record.status === 'live'
                  ? 'second_half'
                  : previousStatus && previousStatus !== 'finished' && record.status === 'finished'
                    ? 'fulltime'
                    : null;
          const baseline = !this.initialized.has(record.id);
          if (baseline) baselineIds.add(record.id);
          this.initialized.add(record.id);
          this.director.manager.get(record.id).liveData!.provider = this.matches.name;
          for (const incident of [...record.incidents].sort(
            (a, b) => a.minute - b.minute || a.timestamp - b.timestamp,
          ))
            this.accept(incident, baseline, now);
          if (phase && !record.incidents.some((i) => i.kind === phase)) {
            const phaseId = `phase:${phase}`;
            this.accept(
              {
                id: phaseId,
                matchId: record.id,
                provider: this.matches.name,
                channel: 'event',
                kind: phase,
                minute: record.minute,
                timestamp: now,
                receivedAt: now,
                sourceIds: [`${this.matches.name}:${record.id}:${phaseId}`],
              },
              false,
              now,
            );
          }
        }
      }
      this.diagnostics.lastSuccessAt = now;
      this.diagnostics.stale = false;
      this.diagnostics.failures = 0;
      this.diagnostics.status = 'connected';
      this.diagnostics.message =
        'Datos LIVE recibidos; los valores ausentes no se estiman como datos oficiales';
      this.log('match-feed-ok', 'info', now);
      if (this.commentary && now >= this.commentaryNextAt) {
        try {
          const narration = await abortable(
            this.commentary.getCommentary(eligible, abort.signal),
            abort.signal,
          );
          if (generation !== this.generation || abort.signal.aborted) return;
          for (const incident of narration)
            if (eligible.some((m) => m.id === incident.matchId))
              this.accept(incident, baselineIds.has(incident.matchId), now);
          this.diagnostics.commentary = 'available';
          this.commentaryFailures = 0;
          this.commentaryNextAt = now + (this.options.pollMs ?? 15000);
        } catch (error) {
          if (generation !== this.generation) return;
          this.commentaryFailures++;
          this.commentaryNextAt =
            now +
            Math.max(
              this.retry(this.commentaryFailures),
              error instanceof ProviderHttpError ? error.retryAfterMs : 0,
            );
          this.diagnostics.commentary = 'reconnecting';
          this.log('commentary-unavailable-events-fallback', 'warn', now);
        }
      }

      this.diagnostics.nextRetryAt = now + (this.options.pollMs ?? 15000);
      // Retain recent dedupe state through reconnections and bounded cache across long sessions.
      for (const [key, item] of this.seen)
        if (now - item.firstAt > 4 * 3600000) this.seen.delete(key);
      while (this.seen.size > 30000) this.seen.delete(this.seen.keys().next().value!);
    } catch (error) {
      if (generation !== this.generation) return;
      this.diagnostics.failures++;
      const retry = Math.max(
        this.retry(this.diagnostics.failures),
        error instanceof ProviderHttpError ? error.retryAfterMs : 0,
      );
      this.diagnostics.nextRetryAt = now + retry;
      this.diagnostics.status = 'reconnecting';
      this.director.dataFresh = false;
      this.diagnostics.message =
        'Proveedor no disponible. Se conservan los últimos datos y se reintentará automáticamente';
      this.log(
        error instanceof ProviderHttpError
          ? `match-http-${error.status}`
          : abort.signal.aborted
            ? 'match-timeout'
            : 'match-invalid-or-unavailable',
        'error',
        now,
      );
    } finally {
      clearTimeout(timeout);
      this.polling = false;
      if (this.abort === abort) this.abort = null;
    }
  }
  private retry(failures: number) {
    return Math.min(60000, 1000 * 2 ** Math.min(6, failures - 1));
  }
  private accept(incident: LiveIncident, baseline: boolean, now: number) {
    const key = `${incident.provider}:${incident.matchId}:${incident.channel}:${incident.id}`;
    if (this.seen.has(key)) {
      this.diagnostics.duplicates++;
      return;
    }
    const channel = incident.channel;
    const candidates = [...new Set(this.seen.values())].filter((item) => {
      const other = item.incident;
      if (other.matchId !== incident.matchId || item.channels.has(channel)) return false;
      if (family(other.kind) !== family(incident.kind)) return false;
      if (incident.correlationId && other.correlationId)
        return incident.correlationId === other.correlationId;
      if (
        other.minute !== incident.minute ||
        other.side !== incident.side ||
        family(other.kind) !== family(incident.kind)
      )
        return false;
      if (other.player && incident.player && normalize(other.player) !== normalize(incident.player))
        return false;
      if (family(incident.kind) === 'attempt' && (!other.player || !incident.player)) return false;
      return Math.abs(other.timestamp - incident.timestamp) <= 90000;
    });
    if (candidates.length === 1) {
      const target = candidates[0],
        other = target.incident;
      Object.assign(other, {
        ...incident,
        ...other,
        text: incident.text ?? other.text,
        player: other.player ?? incident.player,
        action: other.action ?? incident.action,
        outcome: other.outcome ?? incident.outcome,
        kind: family(other.kind) === 'attempt' && incident.kind === 'save' ? 'save' : other.kind,
        sourceIds: [...new Set([...other.sourceIds, ...incident.sourceIds])],
      });
      target.channels.add(channel);
      this.seen.set(key, target);
      this.diagnostics.duplicates++;
      this.log('cross-channel-merged', 'info', now, incident.matchId);
      return;
    }
    const item: Seen = {
      incident: structuredClone(incident),
      channels: new Set([channel]),
      queued: false,
      baseline,
      firstAt: now,
    };
    this.seen.set(key, item);
    // Observe facts immediately; only publication waits for narrative enrichment.
    this.director.receiveLiveIncident(item.incident, false, now);
    if (
      baseline ||
      (incident.timestampQuality !== 'estimated' && now - incident.timestamp > 180000)
    ) {
      item.baseline = true;
    } else this.pending.add(item);
  }
  snapshot(now = Date.now()) {
    return { ...this.director.snapshot(now), live: structuredClone(this.diagnostics) };
  }
}

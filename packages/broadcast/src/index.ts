import {
  platforms,
  type BroadcastDestinationStatus,
  type Composition,
  type Platform,
} from '../../shared/src/index';
export interface Encoder {
  start(
    composition: Composition,
    onPacket: (packet: Uint8Array) => void,
    onError: () => void,
  ): void;
  write(composition: Composition, bytes: Uint8Array): boolean;
  stop(composition?: Composition): void;
}
export interface BroadcastOutput {
  readonly platform: Platform;
  readonly configured: boolean;
  readonly metadataSupported: boolean;
  start(callbacks: { live(): void; failed(): void }): void;
  write(packet: Uint8Array): boolean;
  stop(): void;
  updateMetadata(title: string, category: string): Promise<void>;
}
export const broadcastDimensions = { landscape: [1280, 720], portrait: [720, 1280] } as const;
interface Slot {
  connectedAt?: number;
  output: BroadcastOutput;
  state: BroadcastDestinationStatus;
  generation: number;
}
/** Own-program video only. Destinations receive encoded bytes, never match media URLs. */
export class BroadcastOutputManager {
  private slots: Slot[];
  private lease: string | null = null;
  private lastInput: number | null = null;
  private startedAt = 0;
  private logs: { at: number; code: string; platform?: Platform }[] = [];
  private activeLayouts = new Set<Composition>();
  private layoutInput = new Map<Composition, number>();
  running = false;
  private previewOnly = false;
  private runId = 0;
  private encodedBytes: Record<Composition, number> = { landscape: 0, portrait: 0 };
  constructor(
    private encoder: Encoder,
    outputs: BroadcastOutput[],
    readonly encoderAvailable: boolean,
    readonly audioAvailable = false,
    private makeId: () => string = () => crypto.randomUUID(),
  ) {
    this.slots = outputs.map((output) => ({
      output,
      generation: 0,
      state: {
        platform: output.platform,
        enabled: false,
        configured: output.configured,
        composition: output.platform === 'tiktok' ? 'portrait' : 'landscape',
        status: output.configured ? 'disabled' : 'unconfigured',
        message: output.configured
          ? 'Salida lista; no está emitiendo'
          : 'Configura el endpoint y la clave oficial en el servidor',
        failures: 0,
        nextRetryAt: null,
        title: '',
        category: '',
        metadataSupported: output.metadataSupported,
      },
    }));
  }
  private log(code: string, platform?: Platform, now = Date.now()) {
    this.logs.unshift({ at: now, code, ...(platform ? { platform } : {}) });
    this.logs = this.logs.slice(0, 100);
  }
  enable(platform: Platform, enabled: boolean, now = Date.now()) {
    const slot = this.slots.find((s) => s.output.platform === platform);
    if (!slot) throw new Error('Destino desconocido');
    slot.generation++;
    slot.output.stop();
    slot.state.enabled = enabled;
    slot.state.status = !slot.output.configured
      ? 'unconfigured'
      : enabled
        ? this.running
          ? 'waiting-input'
          : 'ready'
        : 'disabled';
    slot.state.nextRetryAt = enabled && slot.output.configured && this.running ? now : null;
    slot.state.message = enabled
      ? slot.output.configured
        ? 'Esperando señal del compositor'
        : 'Falta configuración o permiso de emisión oficial'
      : 'Salida desactivada';
    if (this.running && enabled && slot.output.configured)
      this.ensureEncoder(slot.state.composition);
    this.log(enabled ? 'output-enabled' : 'output-disabled', platform, now);
  }
  start(now = Date.now(), previewOnly = false) {
    if (this.running) throw new Error('Ya hay un productor de vídeo activo');
    if (!this.encoderAvailable) throw new Error('FFmpeg no está disponible en el servidor');
    const slots = this.slots.filter((s) => s.state.enabled && s.output.configured);
    if (!slots.length && !previewOnly) throw new Error('Activa al menos una salida configurada');
    this.runId++;
    this.previewOnly = previewOnly;
    this.encodedBytes = { landscape: 0, portrait: 0 };
    this.running = true;
    this.lease = this.makeId();
    this.lastInput = null;
    this.startedAt = now;
    for (const slot of slots) {
      slot.state.status = 'waiting-input';
      slot.state.nextRetryAt = now;
    }
    this.ensureEncoder('landscape');
    this.ensureEncoder('portrait');
    if (!this.activeLayouts.size) {
      this.stop('encoder-error');
      throw new Error('No hay codificadores disponibles');
    }
    this.log('broadcast-started', undefined, now);
    return { sessionId: this.lease, runId: this.runId, compositions: [...this.activeLayouts] };
  }
  private ensureEncoder(composition: Composition) {
    if (this.activeLayouts.has(composition)) return;
    this.activeLayouts.add(composition);
    try {
      const lease = this.lease;
      this.encoder.start(
        composition,
        (packet) => {
          if (!this.running || this.lease !== lease) return;
          this.encodedBytes[composition] += packet.byteLength;
          if (this.previewOnly) return;
          for (const slot of this.slots)
            if (
              slot.state.enabled &&
              slot.state.composition === composition &&
              ['connecting', 'live'].includes(slot.state.status)
            )
              if (!slot.output.write(packet)) this.failed(slot, Date.now(), 'output-backpressure');
        },
        () => {
          if (this.lease === lease) this.encoderFailed(composition);
        },
      );
    } catch {
      this.encoderFailed(composition);
    }
  }
  private encoderFailed(composition: Composition) {
    if (!this.running || !this.activeLayouts.has(composition)) return;
    this.activeLayouts.delete(composition);
    this.encoder.stop(composition);
    this.log(`encoder-${composition}-failed`);
    for (const slot of this.slots)
      if (slot.state.composition === composition && slot.state.enabled) {
        slot.generation++;
        slot.output.stop();
        slot.state.status = 'error';
        slot.state.message =
          'Error de codificador; reinicia el productor para recuperar este formato';
        slot.state.nextRetryAt = null;
      }
    if (!this.activeLayouts.size) this.stop('encoder-error');
  }
  ingest(sessionId: string, composition: Composition, bytes: Uint8Array, now = Date.now()) {
    if (!this.running || sessionId !== this.lease || !this.activeLayouts.has(composition))
      throw new Error('Sesión de vídeo obsoleta');
    if (!bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024)
      throw new Error('Fragmento de vídeo inválido');
    if (!this.encoder.write(composition, bytes)) {
      this.encoderFailed(composition);
      throw new Error('El codificador no puede aceptar más vídeo');
    }
    this.lastInput = now;
    this.layoutInput.set(composition, now);
  }
  private failed(slot: Slot, now: number, code = 'destination-disconnected') {
    if (!this.running || !slot.state.enabled) return;
    slot.generation++;
    slot.output.stop();
    slot.state.failures++;
    slot.state.status = 'reconnecting';
    slot.state.message = code;
    slot.state.nextRetryAt =
      now + Math.min(60000, 1000 * 2 ** Math.min(6, slot.state.failures - 1));
    this.log(code, slot.state.platform, now);
  }
  tick(now = Date.now()) {
    if (!this.running) return;
    if (now - (this.lastInput ?? this.startedAt) > 15000) {
      this.stop('producer-timeout');
      return;
    }
    for (const composition of this.activeLayouts)
      if (now - (this.layoutInput.get(composition) ?? this.startedAt) > 15000)
        this.encoderFailed(composition);
    for (const slot of this.slots)
      if (slot.state.status === 'connecting' && now - (slot.connectedAt ?? now) > 15000)
        this.failed(slot, now, 'destination-timeout');
    for (const slot of this.slots)
      if (
        !this.previewOnly &&
        slot.state.enabled &&
        slot.output.configured &&
        this.activeLayouts.has(slot.state.composition) &&
        ['waiting-input', 'reconnecting'].includes(slot.state.status) &&
        now >= (slot.state.nextRetryAt ?? 0) &&
        this.lastInput !== null
      ) {
        const generation = ++slot.generation;
        slot.connectedAt = now;
        slot.state.status = 'connecting';
        slot.state.message = 'Conectando con la plataforma';
        try {
          slot.output.start({
            live: () => {
              if (!this.running || generation !== slot.generation || !slot.state.enabled) return;
              slot.state.status = 'live';
              slot.state.failures = 0;
              slot.state.message = 'La plataforma está recibiendo la señal';
              slot.state.nextRetryAt = null;
              this.log('destination-live', slot.state.platform);
            },
            failed: () => {
              if (generation === slot.generation) this.failed(slot, Date.now());
            },
          });
        } catch {
          this.failed(slot, now);
        }
      }
  }
  async metadata(platform: Platform, title: string, category: string) {
    const slot = this.slots.find((s) => s.output.platform === platform);
    if (!slot) throw new Error('Destino desconocido');
    if (!slot.output.metadataSupported)
      throw new Error('Título/categoría se configuran en el panel oficial de esta plataforma');
    try {
      await slot.output.updateMetadata(title, category);
    } catch {
      this.log('metadata-update-failed', platform);
      throw new Error(
        'No se pudieron actualizar los metadatos; revisa permisos y configuración del servidor',
      );
    }
    slot.state.title = title;
    slot.state.category = category;
    this.log('metadata-updated', platform);
  }
  stop(code = 'broadcast-stopped') {
    this.running = false;
    this.lease = null;
    this.activeLayouts.clear();
    this.layoutInput.clear();
    this.encoder.stop();
    for (const slot of this.slots) {
      slot.generation++;
      slot.output.stop();
      slot.state.status = !slot.output.configured
        ? 'unconfigured'
        : slot.state.enabled
          ? 'ready'
          : 'disabled';
      slot.state.nextRetryAt = null;
      slot.state.message = code;
    }
    this.log(code);
  }
  authorized(sessionId: string) {
    return this.running && sessionId === this.lease;
  }
  snapshot(audioReadyId: string | null = null) {
    return {
      running: this.running,
      runId: this.runId,
      previewOnly: this.previewOnly,
      encodedBytes: { ...this.encodedBytes },
      encoderAvailable: this.encoderAvailable,
      audioAvailable: this.audioAvailable,
      audioReadyId,
      compositions: {
        landscape: [...broadcastDimensions.landscape] as [number, number],
        portrait: [...broadcastDimensions.portrait] as [number, number],
      },
      destinations: structuredClone(this.slots.map((s) => s.state)),
      framesAt: this.lastInput,
      logs: structuredClone(this.logs),
    };
  }
}
export const broadcastPlatforms = platforms;

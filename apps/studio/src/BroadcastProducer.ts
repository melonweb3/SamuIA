import type { Composition, StudioSnapshot } from '../../../packages/shared/src/index';
import { VideoCompositor } from './VideoCompositor';
export class BroadcastProducer {
  private context: AudioContext;
  private destination: MediaStreamAudioDestinationNode;
  private silent: ConstantSourceNode;
  private recorders: MediaRecorder[] = [];
  private streams: MediaStream[] = [];
  private sessionId = '';
  private runId = 0;
  private stopped = false;
  private audioSource: AudioBufferSourceNode | null = null;
  private audioId: string | null = null;
  private loadingAudio: string | null = null;
  private audioOffset = 0;
  private audioStartedAt = 0;
  private audioPaused = false;
  private state: StudioSnapshot;
  constructor(
    private compositions: Record<Composition, VideoCompositor>,
    state: StudioSnapshot,
    private report: (message: string) => void,
  ) {
    this.state = state;
    this.context = new AudioContext({ sampleRate: 48000 });
    this.destination = this.context.createMediaStreamDestination();
    this.silent = this.context.createConstantSource();
    this.silent.offset.value = 0;
    this.silent.connect(this.destination);
    this.silent.start();
  }
  private async request(action: unknown) {
    const response = await fetch('/api/multiplatform/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Error de emisión');
    return body;
  }
  async start(preview: boolean) {
    if (!window.MediaRecorder || !this.compositions.landscape.canvas.captureStream)
      throw new Error('Este navegador no permite capturar el compositor');
    await this.context.resume();
    const start = await this.request({ action: 'start', preview });
    this.sessionId = start.sessionId;
    this.runId = start.runId;
    try {
      const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!mime) throw new Error('No hay codificador WebM compatible en el navegador');
      for (const composition of start.compositions as Composition[]) {
        const stream = this.compositions[composition].canvas.captureStream(25);
        for (const track of this.destination.stream.getAudioTracks())
          stream.addTrack(track.clone());
        this.streams.push(stream);
        const recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 2500000,
          audioBitsPerSecond: 128000,
        });
        let chain = Promise.resolve(),
          pending = 0,
          failed = false;
        recorder.ondataavailable = (event) => {
          if (this.stopped || failed || !event.data.size) return;
          if (++pending > 8) {
            failed = true;
            recorder.stop();
            this.report(`El envío ${composition} no puede seguir el ritmo`);
            return;
          }
          chain = chain
            .then(async () => {
              if (this.stopped) return;
              const response = await fetch(`/api/broadcast/media?composition=${composition}`, {
                method: 'POST',
                headers: { 'Content-Type': 'video/webm', 'X-Broadcast-Session': this.sessionId },
                body: event.data,
              });
              if (!response.ok) throw new Error('El servidor dejó de aceptar esta composición');
            })
            .catch(() => {
              failed = true;
              if (recorder.state !== 'inactive') recorder.stop();
              this.report(
                `Se ha detenido el formato ${composition}; los otros destinos siguen independientes`,
              );
            })
            .finally(() => {
              pending--;
            });
        };
        recorder.start(500);
        this.recorders.push(recorder);
      }
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  matches(state: StudioSnapshot) {
    return this.runId > 0 && state.multiplatform?.broadcast.runId === this.runId;
  }
  update(state: StudioSnapshot) {
    this.state = state;
    const voice = state.voice;
    if (this.stopped || !this.matches(state)) return;
    if (
      this.audioId &&
      (voice.utteranceId !== this.audioId ||
        ['ended', 'cancelled', 'error', 'idle'].includes(voice.status))
    ) {
      this.clearAudio();
    }
    if (this.audioId && voice.status === 'paused' && !this.audioPaused) {
      this.audioOffset += this.context.currentTime - this.audioStartedAt;
      this.audioSource!.onended = null;
      this.audioSource!.stop();
      this.audioSource = null;
      this.audioPaused = true;
    }
    if (
      voice.status === 'preparing' &&
      voice.utteranceId &&
      state.multiplatform?.broadcast.audioReadyId === voice.utteranceId &&
      !this.audioId &&
      this.loadingAudio !== voice.utteranceId
    )
      void this.loadAudio(voice.utteranceId);
    if (this.audioPaused && voice.status === 'playing' && this.buffer) {
      this.audioPaused = false;
      this.playBuffer(this.audioId!, this.buffer, this.audioOffset);
    }
  }
  private buffer: AudioBuffer | null = null;
  private async loadAudio(id: string) {
    this.loadingAudio = id;
    try {
      const response = await fetch(`/api/broadcast/audio?id=${encodeURIComponent(id)}`, {
        headers: { 'X-Broadcast-Session': this.sessionId },
      });
      if (!response.ok) throw new Error('Audio no disponible');
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      if (this.stopped || this.state.voice.utteranceId !== id) return;
      this.audioId = id;
      this.buffer = buffer;
      this.audioOffset = 0;
      this.playBuffer(id, buffer, 0);
      await this.request({
        action: 'voice',
        sessionId: this.sessionId,
        id,
        event: 'started',
        positionMs: 0,
      });
    } catch {
      if (!this.stopped) {
        this.report('No se pudo reproducir la voz del comentarista');
        void this.request({
          action: 'voice',
          sessionId: this.sessionId,
          id,
          event: 'failed',
        }).catch(() => {});
      }
    } finally {
      if (this.loadingAudio === id) this.loadingAudio = null;
    }
  }
  private playBuffer(id: string, buffer: AudioBuffer, offset: number) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);
    this.audioSource = source;
    this.audioStartedAt = this.context.currentTime;
    source.onended = () => {
      if (this.stopped || this.audioId !== id || this.audioPaused) return;
      this.clearAudio();
      void this.request({ action: 'voice', sessionId: this.sessionId, id, event: 'ended' }).catch(
        () => {},
      );
    };
    source.start(0, Math.min(offset, buffer.duration));
  }
  private clearAudio() {
    if (this.audioSource) {
      this.audioSource.onended = null;
      try {
        this.audioSource.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.audioSource = null;
    this.audioId = null;
    this.buffer = null;
    this.audioPaused = false;
    this.audioOffset = 0;
  }
  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.clearAudio();
    for (const recorder of this.recorders) if (recorder.state !== 'inactive') recorder.stop();
    for (const stream of this.streams) stream.getTracks().forEach((track) => track.stop());
    this.silent.stop();
    await this.context.close();
    if (this.sessionId) await this.request({ action: 'stop', sessionId: this.sessionId });
  }
}

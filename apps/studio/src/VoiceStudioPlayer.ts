import type { StudioSnapshot } from '../../../packages/shared/src/index';
import { localBrowserVoices } from './browser-voice';
/** One tab owns local playback. The broadcast producer owns it while broadcasting. */
export class VoiceStudioPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private buffer: AudioBuffer | null = null;
  private token = '';
  private id = '';
  private loading = '';
  private enabled = false;
  private suspended = false;
  private paused = false;
  private offset = 0;
  private startedAt = 0;
  private browserStartedAt = 0;
  private state: StudioSnapshot | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private heartbeatAt = 0;
  private heartbeatPending = false;
  private claiming: Promise<string> | null = null;
  private finished = new Set<string>();
  constructor(private report: (error: string) => void) {}
  async command(body: unknown) {
    const response = await fetch('/api/voice/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'No se pudo completar la acción de voz');
    return result;
  }
  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.gain.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    }
    await this.context.resume();
    this.enabled = true;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 200);
    if (this.state?.multiplatform?.broadcast.running || this.suspended) return;
    const token = await this.claim();
    if (this.suspended || this.state?.multiplatform?.broadcast.running) {
      void this.command({ action: 'release', token }).catch(() => {});
      return;
    }
    this.token = token;
  }
  private claim() {
    if (this.claiming) return this.claiming;
    const promise = this.command({ action: 'claim', ...(this.token ? { token: this.token } : {}) })
      .then((result) => String(result.token))
      .finally(() => {
        if (this.claiming === promise) this.claiming = null;
      });
    this.claiming = promise;
    return promise;
  }
  private dropLease() {
    const token = this.token;
    this.token = '';
    if (token) void this.command({ action: 'release', token }).catch(() => {});
  }
  setSuspended(value: boolean) {
    this.suspended = value;
    if (value) {
      this.clear();
      this.dropLease();
    }
  }
  update(state: StudioSnapshot) {
    this.state = state;
    if (this.gain) this.gain.gain.value = state.voiceStudio?.settings.volume ?? 1;
    if (state.multiplatform?.broadcast.running || this.suspended) {
      this.clear();
      this.dropLease();
      return;
    }
    const voice = state.voice;
    if (
      this.id &&
      (voice.utteranceId !== this.id || !['preparing', 'playing', 'paused'].includes(voice.status))
    )
      this.clear();
    if (this.id && voice.status === 'paused' && !this.paused) {
      this.paused = true;
      if (this.source && this.context) {
        this.offset += this.context.currentTime - this.startedAt;
        this.source.onended = null;
        this.source.stop();
        this.source = null;
      }
      if (this.utterance) window.speechSynthesis.pause();
    }
    if (this.id && this.paused && voice.status === 'playing') {
      this.paused = false;
      if (this.buffer) this.startBuffer(this.buffer, this.offset);
      if (this.utterance) {
        window.speechSynthesis.resume();
        this.browserStartedAt = performance.now() - this.offset * 1000;
      }
    }
    const ready = state.voiceStudio?.ready;
    if (
      this.enabled &&
      this.token &&
      ready &&
      voice.status === 'preparing' &&
      voice.utteranceId === ready.id &&
      !this.id &&
      this.loading !== ready.id &&
      !this.finished.has(ready.id)
    )
      void this.load(ready);
  }
  private async load(ready: NonNullable<NonNullable<StudioSnapshot['voiceStudio']>['ready']>) {
    this.loading = ready.id;
    const token = this.token;
    try {
      if (ready.mode === 'browser') {
        const voices = localBrowserVoices(),
          voice = voices.find((v) => v.voiceURI === ready.voiceId) ?? voices[0];
        if (!voice) throw new Error('No hay voces locales instaladas en este navegador');
        if (this.state?.voice.utteranceId !== ready.id || this.token !== token) return;
        this.id = ready.id;
        const utterance = new SpeechSynthesisUtterance(this.state.voice.text);
        this.utterance = utterance;
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.volume = this.state.voiceStudio?.settings.volume ?? 1;
        utterance.rate = this.state.voiceStudio?.settings.speechRate ?? 1;
        utterance.onstart = () => {
          this.browserStartedAt = performance.now();
          void this.ack('started').catch(() => {});
        };
        utterance.onend = () => this.ended();
        utterance.onerror = () => this.failed('La voz local no pudo reproducirse');
        window.speechSynthesis.speak(utterance);
        return;
      }
      const response = await fetch(`/api/voice/audio?id=${encodeURIComponent(ready.id)}`, {
        headers: { 'X-Voice-Session': token },
      });
      if (!response.ok) throw new Error('Audio no disponible');
      const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
      if (
        this.state?.voice.utteranceId !== ready.id ||
        this.token !== token ||
        this.state.multiplatform?.broadcast.running
      )
        return;
      this.id = ready.id;
      this.buffer = buffer;
      this.offset = 0;
      this.startBuffer(buffer, 0);
      await this.ack('started');
    } catch (error) {
      if (this.state?.voice.utteranceId === ready.id && this.token === token) {
        this.id = ready.id;
        this.failed(error instanceof Error ? error.message : 'No se pudo reproducir la voz');
      }
    } finally {
      if (this.loading === ready.id) this.loading = '';
    }
  }
  private startBuffer(buffer: AudioBuffer, offset: number) {
    const source = this.context!.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain!);
    this.source = source;
    this.startedAt = this.context!.currentTime;
    source.onended = () => {
      if (this.source === source && !this.paused) this.ended();
    };
    source.start(0, Math.min(offset, buffer.duration));
  }
  private ack(event: 'started' | 'ended' | 'failed') {
    const positionMs = this.buffer
      ? Math.min(
          this.buffer.duration * 1000,
          (this.offset + this.context!.currentTime - this.startedAt) * 1000,
        )
      : Math.max(0, performance.now() - this.browserStartedAt);
    let audioLevel = 0;
    if (this.source && this.analyser) {
      const data = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(data);
      audioLevel = Math.min(
        1,
        Math.sqrt(data.reduce((n, v) => n + ((v - 128) / 128) ** 2, 0) / data.length) * 4,
      );
    }
    return this.command({
      action: 'playback',
      token: this.token,
      id: this.id,
      event,
      positionMs: Math.min(120000, positionMs),
      ...(this.buffer ? { durationMs: this.buffer.duration * 1000 } : {}),
      audioLevel,
    });
  }
  private ended() {
    if (!this.id) return;
    const promise = this.ack('ended');
    this.finished.add(this.id);
    this.clear();
    void promise.catch(() => {});
  }
  private failed(message: string) {
    if (this.id) {
      const promise = this.ack('failed');
      this.finished.add(this.id);
      void promise.catch(() => {});
    }
    this.clear();
    this.report(message);
  }
  private tick() {
    if (!this.enabled || this.suspended || this.state?.multiplatform?.broadcast.running) return;
    if (!this.heartbeatPending && Date.now() - this.heartbeatAt >= 2000) {
      this.heartbeatPending = true;
      this.heartbeatAt = Date.now();
      void this.claim()
        .then((token) => {
          if (this.suspended || this.state?.multiplatform?.broadcast.running) {
            void this.command({ action: 'release', token }).catch(() => {});
            return;
          }
          this.token = token;
        })
        .catch((error) => {
          if (this.suspended || this.state?.multiplatform?.broadcast.running) return;
          this.enabled = false;
          this.clear();
          this.token = '';
          this.report(error.message);
        })
        .finally(() => {
          this.heartbeatPending = false;
        });
    }
    if (this.id && !this.paused && this.state?.voice.status === 'playing')
      void this.ack('started').catch(() => {});
    if (this.finished.size > 100) this.finished.delete(this.finished.values().next().value!);
    if (this.state) this.update(this.state);
  }
  private clear() {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* already ended */
      }
    }
    if (this.utterance) {
      this.utterance.onstart = this.utterance.onend = this.utterance.onerror = null;
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }
    this.source = null;
    this.utterance = null;
    this.buffer = null;
    this.id = '';
    this.offset = 0;
    this.paused = false;
  }
  stop() {
    this.enabled = false;
    this.clear();
    if (this.timer) clearInterval(this.timer);
    if (this.token) void this.command({ action: 'release', token: this.token }).catch(() => {});
    this.token = '';
    void this.context?.close();
  }
}

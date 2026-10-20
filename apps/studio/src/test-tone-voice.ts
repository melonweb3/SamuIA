import type {
  VoiceProvider,
  VoiceRequest,
  VoiceEvents,
  VoicePlayback,
} from '../../../packages/voice/src/index';
/** Local test sound, explicitly not speech or a cloned voice. */
export class TestToneVoiceProvider implements VoiceProvider {
  readonly name = 'Audio de prueba · tono (no voz)';
  readonly audible = true;
  durationMs(text: string) {
    return Math.max(1800, Math.min(6000, text.length * 65));
  }
  play(request: VoiceRequest, events: VoiceEvents): VoicePlayback {
    const context = new AudioContext(),
      osc = context.createOscillator(),
      gain = context.createGain(),
      analyser = context.createAnalyser();
    analyser.fftSize = 256;
    osc.type = 'sine';
    osc.frequency.value = 180;
    osc.connect(gain);
    gain.connect(analyser);
    analyser.connect(context.destination);
    let stopped = false,
      paused = false,
      position = 0,
      last = performance.now();
    void context
      .resume()
      .then(() => {
        if (stopped) return;
        events.timing(0, request.durationMs, [], Date.now(), 'audio-amplitude');
        events.started(Date.now());
        osc.start();
      })
      .catch(() => {
        stop();
        events.failed('No se pudo reproducir el tono de prueba', Date.now());
      });
    const timer = setInterval(() => {
      if (stopped || paused) return;
      const now = performance.now();
      position += now - last;
      last = now;
      gain.gain.value = 0.08 * (0.15 + 0.85 * Math.abs(Math.sin(position / 85)));
      const bytes = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(bytes);
      const level = Math.min(
        1,
        Math.sqrt(bytes.reduce((n, v) => n + ((v - 128) / 128) ** 2, 0) / bytes.length) * 6,
      );
      events.timing(
        Math.min(position, request.durationMs),
        request.durationMs,
        [],
        Date.now(),
        'audio-amplitude',
      );
      events.level?.(level, Date.now());
      if (position >= request.durationMs) {
        stop();
        events.ended(Date.now());
      }
    }, 40);
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      try {
        osc.stop();
      } catch {
        /* not started */
      }
      void context.close();
    };
    return {
      cancel: stop,
      pause() {
        paused = true;
        void context.suspend();
      },
      resume() {
        paused = false;
        last = performance.now();
        void context.resume();
      },
    };
  }
}

import type {
  VoiceEvents,
  VoicePlayback,
  VoiceProvider,
  VoiceRequest,
} from '../../../packages/voice/src/index';

/** Optional local OS speech. No SDK, fetch, credentials or remote voices. */
export class BrowserVoiceProvider implements VoiceProvider {
  readonly name = 'Voz local del navegador';
  readonly audible = true;
  constructor(
    private voice: SpeechSynthesisVoice,
    private synth: SpeechSynthesis = window.speechSynthesis,
  ) {
    if (!voice.localService) throw new Error('Selecciona una voz instalada localmente');
  }
  get voiceURI() {
    return this.voice.voiceURI;
  }
  durationMs(text: string) {
    return Math.max(1800, text.length * 65);
  }
  play(request: VoiceRequest, events: VoiceEvents): VoicePlayback {
    const utterance = new SpeechSynthesisUtterance(request.text);
    utterance.voice = this.voice;
    utterance.lang = this.voice.lang;
    // Browser speech exposes no phoneme alignment; avatar mouth cues remain approximate.
    utterance.onstart = () => events.started(Date.now());
    utterance.onend = () => events.ended(Date.now());
    utterance.onerror = (event) => events.failed(`Voz del navegador: ${event.error}`, Date.now());
    this.synth.speak(utterance);
    return {
      cancel: () => {
        utterance.onstart = utterance.onend = utterance.onerror = null;
        this.synth.cancel();
        if (this.synth.paused) this.synth.resume();
      },
      pause: () => this.synth.pause(),
      resume: () => this.synth.resume(),
    };
  }
}
export function localBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.localService)
    .sort((a, b) => Number(b.lang.startsWith('es')) - Number(a.lang.startsWith('es')));
}

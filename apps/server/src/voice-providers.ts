import type {
  GeneratedSpeech,
  ProviderCapabilities,
  ReactionEvent,
  SpeechSynthesisProvider,
  VoiceProfile,
  VoiceProviderId,
} from '../../../packages/voice/src/index';
export class VoiceApiError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
  ) {
    super(code);
  }
}
const filename = (blob: Blob, role: string) =>
  `${role}.${({ 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/aac': 'aac' } as Record<string, string>)[blob.type] ?? 'wav'}`;
async function limited(response: Response, limit: number) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new VoiceApiError(
      `provider-http-${response.status}`,
      response.status === 429 || response.status >= 500,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new VoiceApiError('provider-empty-response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) throw new VoiceApiError('provider-response-too-large');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}
export class RemoteVoiceProvider implements SpeechSynthesisProvider {
  readonly id: 'openai' | 'elevenlabs';
  constructor(
    id: 'openai' | 'elevenlabs',
    private env: NodeJS.ProcessEnv = process.env,
    private fetcher: typeof fetch = fetch,
  ) {
    this.id = id;
  }
  private get key() {
    return this.env[this.id === 'openai' ? 'OPENAI_API_KEY' : 'ELEVENLABS_API_KEY'] ?? '';
  }
  isAvailable() {
    return !!this.key;
  }
  capabilities(): ProviderCapabilities {
    const openai = this.id === 'openai';
    return {
      id: this.id,
      name: openai ? 'OpenAI' : 'ElevenLabs',
      available: this.isAvailable(),
      customVoices: true,
      emotion: openai && !(this.env.OPENAI_TTS_MODEL ?? '').startsWith('tts-'),
      streaming: false,
      requirements: {
        allowedFormats: ['.wav', '.mp3', '.m4a', '.webm', '.ogg', '.flac', '.aac'],
        maxUploadBytes: 10 * 1024 * 1024,
        minimumSeconds: null,
        recommendedSeconds: null,
        consentRequired: true,
        consentText: openai ? this.env.OPENAI_VOICE_CONSENT_TEXT : undefined,
        consentLanguage: openai ? this.env.OPENAI_VOICE_CONSENT_LANGUAGE || 'en-US' : undefined,
        instructions: openai
          ? 'Acceso a custom voices sujeto a elegibilidad de la cuenta. Graba por separado la muestra y el consentimiento con la frase oficial exacta para el idioma configurado. Configura esa frase en el servidor desde la guía oficial. OpenAI valida grabaciones y consentimiento; máximo 10 MiB por archivo. Sin duración impuesta por esta app.'
          : 'Instant Voice Cloning sujeto al plan y permisos. Confirma que la voz es tuya. El proveedor puede exigir verificación adicional en su panel; el perfil permanecerá pendiente hasta verificarla. El límite de subida de esta app es 10 MiB por archivo, no una duración requerida por ElevenLabs.',
        documentation: openai
          ? 'https://developers.openai.com/api/docs/guides/text-to-speech#custom-voices'
          : 'https://elevenlabs.io/docs/creative-platform/voices/voice-cloning/instant-voice-cloning',
      },
    };
  }
  private async request(path: string, init: RequestInit, signal: AbortSignal, audio = false) {
    if (!this.isAvailable()) throw new VoiceApiError('provider-not-configured');
    try {
      const response = await this.fetcher(
        (this.id === 'openai' ? 'https://api.openai.com/v1' : 'https://api.elevenlabs.io/v1') +
          path,
        {
          ...init,
          headers: {
            ...(this.id === 'openai'
              ? { Authorization: `Bearer ${this.key}` }
              : { 'xi-api-key': this.key }),
            ...init.headers,
          },
          signal: AbortSignal.any([signal, AbortSignal.timeout(audio ? 10000 : 25000)]),
        },
      );
      const data = await limited(response, audio ? 12 * 1024 * 1024 : 1024 * 1024);
      if (!data.length) throw new VoiceApiError('provider-empty-response');
      return data;
    } catch (error) {
      if (error instanceof VoiceApiError) throw error;
      throw new VoiceApiError(
        signal.aborted ? 'provider-cancelled' : 'provider-network-error',
        !signal.aborted,
      );
    }
  }
  async getVoices() {
    if (this.id === 'openai')
      return [
        'alloy',
        'ash',
        'ballad',
        'coral',
        'echo',
        'fable',
        'onyx',
        'nova',
        'sage',
        'shimmer',
        'verse',
        'marin',
        'cedar',
      ].map((id) => ({ id, name: id }));
    const data = JSON.parse(
      new TextDecoder().decode(
        await this.request('/voices', { method: 'GET' }, AbortSignal.timeout(10000)),
      ),
    );
    if (!Array.isArray(data.voices)) throw new VoiceApiError('provider-invalid-voices');
    return data.voices
      .slice(0, 100)
      .filter(
        (v: { voice_id?: unknown; name?: unknown }) =>
          typeof v.voice_id === 'string' && typeof v.name === 'string',
      )
      .map((v: { voice_id: string; name: string }) => ({ id: v.voice_id, name: v.name }));
  }
  async generateSpeech(
    reaction: ReactionEvent,
    profile: VoiceProfile,
    rate: number,
    signal: AbortSignal,
  ): Promise<GeneratedSpeech> {
    if (!profile.providerVoiceId || profile.status !== 'ready')
      throw new VoiceApiError('custom-voice-unavailable');
    const openai = this.id === 'openai';
    const body = openai
      ? {
          model: this.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
          input: reaction.text,
          voice:
            profile.type === 'generic' ? profile.providerVoiceId : { id: profile.providerVoiceId },
          response_format: 'mp3',
          speed: rate,
          ...(this.capabilities().emotion
            ? {
                instructions: `Speak in Spanish. Emotion: ${reaction.emotion}. Intensity: ${reaction.intensity}. Preserve the exact spoken text. Do not add words.`,
              }
            : {}),
        }
      : {
          text: reaction.text,
          model_id: this.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: Math.max(0.7, Math.min(1.2, rate)),
          },
        };
    return {
      audio: await this.request(
        openai
          ? '/audio/speech'
          : `/text-to-speech/${encodeURIComponent(profile.providerVoiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        signal,
        true,
      ),
      mime: 'audio/mpeg',
    };
  }
  async createVoice(name: string, sample: Blob, consent: Blob | null, signal: AbortSignal) {
    let consentId: string | undefined;
    if (this.id === 'openai') {
      if (!consent || !this.env.OPENAI_VOICE_CONSENT_TEXT?.trim())
        throw new VoiceApiError('consent-required');
      const form = new FormData();
      form.set('name', name);
      form.set('language', this.env.OPENAI_VOICE_CONSENT_LANGUAGE || 'en-US');
      form.set('recording', consent, filename(consent, 'consent'));
      const result = JSON.parse(
        new TextDecoder().decode(
          await this.request('/audio/voice_consents', { method: 'POST', body: form }, signal),
        ),
      );
      if (typeof result.id !== 'string' || !result.id.startsWith('cons_'))
        throw new VoiceApiError('invalid-consent-response');
      consentId = result.id;
    }
    const form = new FormData();
    form.set('name', name);
    form.set(this.id === 'openai' ? 'audio_sample' : 'files', sample, filename(sample, 'sample'));
    if (consentId) {
      form.set('consent', consentId);
      form.set('type', 'audio_sample');
    }
    const result = JSON.parse(
      new TextDecoder().decode(
        await this.request(
          this.id === 'openai' ? '/audio/voices' : '/voices/add',
          { method: 'POST', body: form },
          signal,
        ),
      ),
    );
    const id = this.id === 'openai' ? result.id : result.voice_id;
    if (
      typeof id !== 'string' ||
      !id.length ||
      id.length > 256 ||
      (this.id === 'elevenlabs' && typeof result.requires_verification !== 'boolean')
    )
      throw new VoiceApiError('invalid-create-voice-response');
    return { id, consentId, verificationRequired: result.requires_verification === true };
  }
  async verifyVoice(id: string, signal: AbortSignal) {
    if (this.id !== 'elevenlabs') return false;
    const result = JSON.parse(
      new TextDecoder().decode(
        await this.request(`/voices/${encodeURIComponent(id)}`, { method: 'GET' }, signal),
      ),
    );
    return result.voice_id === id && result.voice_verification?.is_verified === true;
  }
}
export function localCapabilities(id: VoiceProviderId, available: boolean): ProviderCapabilities {
  return {
    id,
    name: {
      simulation: 'Simulación sin audio',
      browser: 'Voz local del navegador',
      flite: 'Flite · voz local de prueba',
      openai: 'OpenAI',
      elevenlabs: 'ElevenLabs',
    }[id],
    available,
    customVoices: false,
    emotion: false,
    streaming: false,
    requirements: {
      allowedFormats: [],
      maxUploadBytes: 0,
      minimumSeconds: null,
      recommendedSeconds: null,
      consentRequired: false,
      instructions: 'Preset existente conservado. No clona una voz.',
      documentation: '',
    },
  };
}

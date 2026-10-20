import { useEffect, useRef, useState } from 'react';
import {
  speechPriorities,
  voiceEmotions,
  type VoiceEmotion,
  type SpeechPriority,
  type VoiceSettings,
} from '../../../packages/voice/src/index';
import type { StudioSnapshot } from '../../../packages/shared/src/index';
import type { VoiceStudioPlayer } from './VoiceStudioPlayer';
import { Panel } from './ui';
export function VoiceStudio({
  state,
  player,
  onState,
  portable,
}: {
  state: StudioSnapshot;
  player: VoiceStudioPlayer;
  onState: (s: StudioSnapshot) => void;
  portable: boolean;
}) {
  const [pendingSettings, setPendingSettings] = useState<Partial<VoiceSettings>>({});
  const studio = state.voiceStudio
    ? { ...state.voiceStudio, settings: { ...state.voiceStudio.settings, ...pendingSettings } }
    : undefined;
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [name, setName] = useState('Samuel Voice'),
    [provider, setProvider] = useState<'openai' | 'elevenlabs'>('openai'),
    [selected, setSelected] = useState(''),
    [ownVoice, setOwnVoice] = useState(false);
  const [text, setText] = useState('GOOOOOOL DEL CELTA, VAMOS!'),
    [emotion, setEmotion] = useState<VoiceEmotion>('celebrating'),
    [intensity, setIntensity] = useState(1),
    [priority, setPriority] = useState<SpeechPriority>('NORMAL'),
    [interrupt, setInterrupt] = useState(false),
    [matchId, setMatchId] = useState('');
  const [sample, setSample] = useState<Blob | null>(null),
    [sampleUrl, setSampleUrl] = useState(''),
    [role, setRole] = useState<'sample' | 'consent'>('sample'),
    [duration, setDuration] = useState(0),
    [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    started = useRef(0),
    sampleElement = useRef<HTMLAudioElement | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    if (['preparing', 'playing'].includes(state.voice.status)) sampleElement.current?.pause();
  }, [state.voice.status, state.voice.utteranceId]);
  useEffect(() => {
    if (!sample) {
      setSampleUrl('');
      return;
    }
    const url = URL.createObjectURL(sample);
    setSampleUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sample]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setDuration((Date.now() - started.current) / 1000), 200);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(
    () => () => {
      mounted.current = false;
      if (recorder.current?.state === 'recording') {
        recorder.current.onstop = null;
        recorder.current.ondataavailable = null;
        recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const custom = studio?.profiles.find((p) => p.id === selected),
    cap = studio?.providers.find((p) => p.id === (custom?.provider ?? provider));
  const profile = studio?.profiles.find((p) => p.id === studio.settings.defaultVoiceProfile);
  async function action(body: unknown) {
    setError('');
    setBusy(true);
    try {
      const next = await player.command(body);
      if (next.voiceStudio) onState(next);
      return next;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error de voz');
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function settings(patch: Partial<VoiceSettings>) {
    setPendingSettings((previous) => ({ ...previous, ...patch }));
    try {
      await action({ action: 'configure', patch });
    } finally {
      setPendingSettings((previous) => {
        const next = { ...previous };
        for (const key of Object.keys(patch) as (keyof VoiceSettings)[])
          if (next[key] === patch[key]) delete next[key];
        return next;
      });
    }
  }
  async function enableAudio() {
    setError('');
    try {
      await player.enable();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo activar el audio');
    }
  }
  async function speak(test = false) {
    sampleElement.current?.pause();
    try {
      await player.enable();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Activa el audio');
      return;
    }
    await action({
      action: 'speak',
      text: test ? 'Hola, soy SamuIA. La retransmisión está preparada.' : text,
      emotion: test ? 'neutral' : emotion,
      intensity: test ? 0.4 : intensity,
      priority: test ? 'NORMAL' : priority,
      interrupt,
      ...(matchId ? { matchId } : {}),
      ...(selected && custom?.status === 'ready' ? { profileId: selected } : {}),
    });
  }
  async function record() {
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          'La grabación requiere HTTPS o localhost y un navegador compatible. Puedes subir un archivo.',
        );
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.current.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      if (!mime) throw new Error('No hay formato de grabación compatible; sube WAV, MP3 o M4A');
      const rec = new MediaRecorder(stream.current, { mimeType: mime });
      recorder.current = rec;
      const chunks: Blob[] = [];
      let bytes = 0;
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          bytes += e.data.size;
          if (
            bytes > (cap?.requirements.maxUploadBytes ?? 10 * 1024 * 1024) &&
            rec.state === 'recording'
          ) {
            setError('Se ha alcanzado el límite de tamaño de subida');
            rec.stop();
          }
        }
      };
      rec.onstop = () => {
        setSample(new Blob(chunks, { type: mime.split(';')[0] }));
        setRecording(false);
        stream.current?.getTracks().forEach((t) => t.stop());
      };
      started.current = Date.now();
      setDuration(0);
      setSample(null);
      setRecording(true);
      rec.start(500);
    } catch (error) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(error instanceof Error ? error.message : 'No se pudo acceder al micrófono');
    }
  }
  async function upload() {
    if (!sample || !selected) return;
    setBusy(true);
    setError('');
    sampleElement.current?.pause();
    try {
      const response = await fetch(
        `/api/voice/sample?profileId=${encodeURIComponent(selected)}&role=${role}`,
        {
          method: 'POST',
          headers: { 'Content-Type': sample.type || 'application/octet-stream' },
          body: sample,
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo subir la muestra');
      onState(result);
      setSample(null);
      setDuration(0);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al subir');
    } finally {
      setBusy(false);
    }
  }
  if (portable || !studio)
    return (
      <div className="info-banner">
        <b>Voice Studio necesita el servidor.</b>
        <p>
          El HTML conserva SIMULATION y las voces locales de Partido de prueba. Las claves y
          grabaciones de voz personalizada se gestionan en el servidor.
        </p>
      </div>
    );
  return (
    <div className="voice-studio">
      <div className="info-banner">
        <b>Tu voz personalizada para textos nuevos.</b>
        <p>
          Los perfiles, muestras y consentimiento se gestionan con el proveedor seleccionado. Sin
          credenciales o verificación no se crea una voz real. Las voces locales anteriores siguen
          disponibles.
        </p>
      </div>
      {error && (
        <div role="alert" className="error-text">
          {error}
        </div>
      )}
      {studio.persistenceError && (
        <div role="alert" className="error-text">
          {studio.persistenceError}
        </div>
      )}
      <div className="two-col">
        <Panel title="VOICE STATUS">
          <div className="settings-body">
            <h2>{profile?.name ?? 'Sin perfil'}</h2>
            <b data-testid="voice-profile-status">{profile?.status.toUpperCase()}</b>
            <p>
              Provider: {profile?.provider} · Fallback:{' '}
              {studio.profiles.find((p) => p.id === studio.settings.fallbackVoice)?.name}
            </p>
            <p data-testid="voice-engine-status">
              {state.voice.engineStatus ?? state.voice.status} · {state.voice.provider}
            </p>
            <p>{state.voice.text || 'Esperando una reacción'}</p>
            <small>
              {state.voice.reaction?.emotion ?? 'neutral'} · intensidad{' '}
              {state.voice.reaction?.intensity ?? 0} · prioridad{' '}
              {state.voice.reaction?.priority ?? 'NORMAL'} · partido{' '}
              {state.voice.reaction?.matchId ?? 'estudio'}
            </small>
            <label>
              Speech progress
              <progress max={1} value={state.voice.speechProgress ?? 0} />
            </label>
            <label>
              Audio level
              <progress max={1} value={state.voice.audioLevel ?? 0} />
            </label>
            <small>
              El nivel procede del audio capturado cuando está disponible; la voz del navegador no
              expone su amplitud. Visemas fonéticos aún no conectados.
            </small>
            <div className="button-row">
              <button onClick={() => void enableAudio()}>Activar audio en esta pestaña</button>
              <button
                onClick={() => void speak(true)}
                disabled={busy || !studio.settings.voiceEnabled}
              >
                TEST MY VOICE
              </button>
              <button onClick={() => void action({ action: 'stop' })}>STOP SPEECH</button>
            </div>
            {state.voice.error && <p className="error-text">{state.voice.error}</p>}
          </div>
        </Panel>
        <Panel title="Configuración de voz">
          <div className="settings-body">
            <label>
              Voice enabled
              <input
                type="checkbox"
                checked={studio.settings.voiceEnabled}
                onChange={(e) => void settings({ voiceEnabled: e.target.checked })}
              />
            </label>
            <label>
              VOICE PROVIDER
              <select
                aria-label="VOICE PROVIDER"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as typeof provider);
                  setSelected('');
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </label>
            <label>
              DEFAULT VOICE
              <select
                aria-label="DEFAULT VOICE"
                value={studio.settings.defaultVoiceProfile}
                onChange={(e) => void settings({ defaultVoiceProfile: e.target.value })}
              >
                {studio.profiles.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={
                      p.status !== 'ready' ||
                      !studio.providers.find((s) => s.id === p.provider)?.available
                    }
                  >
                    {p.name} · {p.provider} · {p.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fallback
              <select
                aria-label="Fallback de voz"
                value={studio.settings.fallbackVoice}
                onChange={(e) => void settings({ fallbackVoice: e.target.value })}
              >
                {studio.profiles.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={
                      p.status !== 'ready' ||
                      !studio.providers.find((s) => s.id === p.provider)?.available
                    }
                  >
                    {p.name} · {p.provider}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Volume {studio.settings.volume.toFixed(2)}
              <input
                aria-label="Volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={studio.settings.volume}
                onChange={(e) => void settings({ volume: Number(e.target.value) })}
              />
            </label>
            <label>
              Speech rate {studio.settings.speechRate.toFixed(2)}
              <input
                aria-label="Speech rate"
                type="range"
                min="0.7"
                max="1.2"
                step="0.05"
                value={studio.settings.speechRate}
                onChange={(e) => void settings({ speechRate: Number(e.target.value) })}
              />
            </label>
            <label>
              Permitir interrupciones
              <input
                type="checkbox"
                checked={studio.settings.interruptEnabled}
                onChange={(e) => void settings({ interruptEnabled: e.target.checked })}
              />
            </label>
            <small>
              Configuración persistida en el servidor privado. Las claves se leen del entorno y no
              se envían al navegador.
            </small>
          </div>
        </Panel>
        <Panel title="Crear y gestionar un perfil">
          <div className="settings-body">
            <label>
              Nombre del perfil
              <input
                aria-label="Nombre del perfil de voz"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              disabled={busy || !name.trim()}
              onClick={() =>
                void action({ action: 'profile', name, provider }).then((result) => {
                  const p = result?.voiceStudio?.profiles.at(-1);
                  if (p) {
                    setSelected(p.id);
                    setOwnVoice(false);
                  }
                })
              }
            >
              Crear perfil
            </button>
            <label>
              VOICE PROFILE
              <select
                aria-label="VOICE PROFILE"
                disabled={recording || busy}
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setSample(null);
                  setOwnVoice(false);
                }}
              >
                <option value="">Selecciona un perfil</option>
                {studio.profiles
                  .filter((p) => p.type !== 'generic')
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} · {p.provider} · {p.status}
                    </option>
                  ))}
              </select>
            </label>
            {custom && (
              <>
                <p>
                  {custom.name} · {custom.status} {custom.error && `· ${custom.error}`}
                </p>
                <p>
                  {cap?.available
                    ? 'Proveedor configurado en servidor'
                    : 'Not configured: falta la API key del proveedor'}
                </p>
                <div className="button-row">
                  <button
                    disabled={busy || custom.status !== 'ready'}
                    onClick={() => void settings({ defaultVoiceProfile: custom.id })}
                  >
                    Usar como DEFAULT VOICE
                  </button>
                  <button
                    disabled={busy || custom.status === 'processing'}
                    onClick={() =>
                      void action({ action: 'remove', id: custom.id }).then(() => setSelected(''))
                    }
                  >
                    Eliminar perfil local
                  </button>
                </div>
                <small>
                  Eliminar el perfil borra los datos locales y las muestras temporales; los recursos
                  creados en el proveedor se gestionan en su panel.
                </small>
                {custom.status === 'waiting-consent' && custom.providerVoiceId && (
                  <>
                    <p>Completa la verificación de identidad en el panel oficial del proveedor.</p>
                    <button onClick={() => void action({ action: 'verify', id: custom.id })}>
                      Comprobar verificación del proveedor
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </Panel>
        <Panel title="RECORD / UPLOAD VOICE SAMPLE">
          <div className="settings-body">
            <p>{cap?.requirements.instructions}</p>
            <small>
              Formatos: {cap?.requirements.allowedFormats.join(', ')} · máximo{' '}
              {((cap?.requirements.maxUploadBytes ?? 0) / 1024 / 1024).toFixed(0)} MiB.
              <br />
              Duración mínima: {cap?.requirements.minimumSeconds ?? 'la valida el proveedor'} ·
              recomendada:{' '}
              {cap?.requirements.recommendedSeconds ?? 'consulta la guía del proveedor'}.
            </small>
            {cap?.requirements.documentation && (
              <a href={cap.requirements.documentation} target="_blank" rel="noreferrer">
                Requisitos oficiales y consentimiento
              </a>
            )}
            <label>
              Tipo de grabación
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as typeof role);
                  setSample(null);
                }}
                disabled={recording}
              >
                <option value="sample">Muestra de mi voz</option>
                <option value="consent">Consentimiento</option>
              </select>
            </label>
            {role === 'consent' && (
              <p>
                {cap?.requirements.consentText ||
                  'Consulta el texto oficial en la guía del proveedor. Para OpenAI configura esa frase exacta y su idioma en el servidor antes de enviar consentimiento.'}
              </p>
            )}
            <input
              aria-label="Subir muestra de voz"
              type="file"
              accept={cap?.requirements.allowedFormats.join(',') || '.wav,.mp3,.m4a'}
              disabled={!custom || busy || recording || !!custom.providerVoiceId}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const types: Record<string, string> = {
                    wav: 'audio/wav',
                    mp3: 'audio/mpeg',
                    m4a: 'audio/mp4',
                    webm: 'audio/webm',
                    ogg: 'audio/ogg',
                    flac: 'audio/flac',
                    aac: 'audio/aac',
                  };
                  setSample(
                    file.type
                      ? file
                      : new Blob([file], {
                          type:
                            types[file.name.split('.').at(-1)?.toLowerCase() ?? ''] ??
                            'application/octet-stream',
                        }),
                  );
                  setDuration(0);
                }
                e.target.value = '';
              }}
            />
            <div className="button-row">
              <button
                disabled={!custom || busy || recording || !!custom.providerVoiceId}
                onClick={() => void record()}
              >
                RECORD VOICE SAMPLE
              </button>
              <button disabled={!recording} onClick={() => recorder.current?.stop()}>
                Parar grabación
              </button>
              <button
                disabled={!sample || busy}
                onClick={() => {
                  setSample(null);
                  setDuration(0);
                }}
              >
                Eliminar y repetir
              </button>
            </div>
            <p>
              Duración: {duration.toFixed(1)} s
              {sample && ` · ${(sample.size / 1024).toFixed(0)} KiB`}
            </p>
            {sampleUrl && (
              <audio
                ref={sampleElement}
                src={sampleUrl}
                controls
                onPlay={() => void action({ action: 'stop' })}
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d)) setDuration(d);
                }}
              />
            )}
            <button
              disabled={!sample || !custom || busy || recording}
              onClick={() => void upload()}
            >
              Enviar {role === 'sample' ? 'muestra' : 'consentimiento'} al servidor privado
            </button>
            {custom &&
              studio.samples
                .filter((s) => s.profileId === custom.id)
                .map((s) => (
                  <div key={s.role}>
                    <span>
                      {s.role} validado · {s.duration.toFixed(1)} s · {(s.bytes / 1024).toFixed(0)}{' '}
                      KiB
                    </span>
                    <button
                      onClick={() =>
                        void action({ action: 'sample-delete', id: custom.id, role: s.role })
                      }
                    >
                      Borrar {s.role}
                    </button>
                  </div>
                ))}
            <label>
              <input
                type="checkbox"
                checked={ownVoice}
                onChange={(e) => setOwnVoice(e.target.checked)}
              />
              Esta es mi propia voz y autorizo enviarla al proveedor seleccionado para crear mi
              perfil.
            </label>
            <button
              disabled={
                !custom ||
                busy ||
                !ownVoice ||
                !cap?.available ||
                custom.status === 'processing' ||
                !!custom.providerVoiceId ||
                !studio.samples.some((s) => s.profileId === custom.id && s.role === 'sample') ||
                (custom.provider === 'openai' &&
                  (!cap.requirements.consentText ||
                    !studio.samples.some((s) => s.profileId === custom.id && s.role === 'consent')))
              }
              onClick={() => {
                sampleElement.current?.pause();
                void action({ action: 'create', id: custom!.id, ownVoice });
              }}
            >
              CREATE CUSTOM VOICE
            </button>
            <small>
              Las muestras del servidor caducan a los 30 minutos y se eliminan después del intento
              de creación. No quedan archivadas como archivos públicos.
            </small>
          </div>
        </Panel>
        <Panel title="VOICE TEST / OPERATOR MESSAGE">
          <div className="settings-body">
            <label>
              Text
              <textarea
                aria-label="Texto de Voice Test"
                value={text}
                maxLength={2000}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <label>
              Emotion
              <select value={emotion} onChange={(e) => setEmotion(e.target.value as VoiceEmotion)}>
                {voiceEmotions.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </label>
            <label>
              Intensity {intensity.toFixed(2)}
              <input
                aria-label="Intensity"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
              />
            </label>
            <label>
              Priority
              <select
                aria-label="Priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as SpeechPriority)}
              >
                {speechPriorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Partido
              <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
                <option value="">Estudio / sin partido</option>
                {state.activeMatches.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.home.name} – {m.away.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={interrupt}
                onChange={(e) => setInterrupt(e.target.checked)}
              />
              INTERRUPT CURRENT SPEECH
            </label>
            <p>
              Voz: {custom?.status === 'ready' ? custom.name : profile?.name}. El mensaje del
              operador pasa por el cerebro y una ReactionEvent antes del TTS.
            </p>
            <div className="button-row">
              <button
                disabled={busy || !text.trim() || !studio.settings.voiceEnabled}
                onClick={() => void speak()}
              >
                SPEAK / SAY NOW
              </button>
              <button onClick={() => void action({ action: 'stop' })}>STOP SPEECH</button>
            </div>
            <small>
              Los eventos del Dashboard usan automáticamente DEFAULT VOICE. Partido de prueba
              conserva su sesión y selector local anteriores.
            </small>
          </div>
        </Panel>
        <Panel title="Observabilidad de voz">
          <div className="settings-body">
            <p>
              Cola de voz: {state.voice.queueLength ?? 0}. Las colas editoriales de eventos y
              operador mantienen su orden y prioridad.
            </p>
            {studio.logs.slice(0, 16).map((l, i) => (
              <div key={i}>
                <time>{new Date(l.at).toLocaleTimeString()}</time> · {l.code}{' '}
                {l.provider && `· ${l.provider}`}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

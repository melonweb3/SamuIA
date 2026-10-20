import { useEffect, useRef, useState } from 'react';
import {
  avatarStates,
  renderModes,
  reactionKinds,
  builtInReactions,
  defaultAvatarSettings,
  type AvatarEngineSettings,
  type ReactionAsset,
  type ReactionKind,
  type MotionReference,
  type AvatarVisualState,
} from '../../../packages/avatar-engine/src/index';
import {
  voiceEmotions,
  speechPriorities,
  type VoiceEmotion,
  type SpeechPriority,
} from '../../../packages/voice/src/index';
import {
  avatarAnimations,
  type AvatarAnimation,
  type StudioSnapshot,
} from '../../../packages/shared/src/index';
import type { ReactionDirector } from '../../../packages/core/src/index';
import { MockVoiceProvider } from '../../../packages/core/src/visual';
import { Avatar } from './Avatar';
import { useLiveAvatarFrame } from './AvatarRendererHost';
import { Panel, type Send } from './ui';
import { BrowserVoiceProvider, localBrowserVoices } from './browser-voice';
import { TestToneVoiceProvider } from './test-tone-voice';
import type { VoiceStudioPlayer } from './VoiceStudioPlayer';
import { BrowserReferenceRepository, ServerReferenceRepository } from './reaction-references';
const kindVoice = (kind: ReactionKind): VoiceEmotion =>
  (
    ({
      celebrating_big: 'celebrating',
      goal_against: 'frustrated',
      penalty: 'tense',
      disbelief: 'surprised',
      talking: 'neutral',
    }) as const
  )[kind as 'celebrating_big' | 'goal_against' | 'penalty' | 'disbelief' | 'talking'] ??
  (kind as VoiceEmotion);
const tags = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
export function ReactionStudio({
  state,
  send,
  session,
  player,
  onState,
}: {
  state: StudioSnapshot;
  send: Send;
  session?: ReactionDirector;
  player: VoiceStudioPlayer;
  onState: (s: StudioSnapshot) => void;
}) {
  const [pending, setPending] = useState<Partial<AvatarEngineSettings>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const settings = { ...defaultAvatarSettings, ...state.animation.engine?.settings, ...pending };
  const live = useLiveAvatarFrame(state.animation),
    engine = live.engine;
  const [assetPatches, setAssetPatches] = useState<Record<string, Partial<ReactionAsset>>>({});
  const assets = (state.reactionLibrary ?? []).map((a) => ({ ...a, ...assetPatches[a.id] }));
  async function updateAsset(asset: ReactionAsset, patch: Partial<ReactionAsset>) {
    setAssetPatches((p) => ({ ...p, [asset.id]: { ...p[asset.id], ...patch } }));
    try {
      await send({ type: 'reaction-upsert', asset: { ...asset, ...patch } });
    } finally {
      setAssetPatches((p) => {
        const next = { ...p },
          value = { ...next[asset.id] };
        for (const key of Object.keys(patch) as (keyof ReactionAsset)[])
          if (value[key] === patch[key]) delete value[key];
        next[asset.id] = value;
        return next;
      });
    }
  }
  const [text, setText] = useState('GOOOOOOOL DEL CELTA!'),
    [emotion, setEmotion] = useState<VoiceEmotion>('celebrating'),
    [intensity, setIntensity] = useState(1),
    [priority, setPriority] = useState<SpeechPriority>('NORMAL'),
    [visualState, setVisualState] = useState<AvatarVisualState | ''>(''),
    [animation, setAnimation] = useState<AvatarAnimation | ''>(''),
    [selectedAsset, setSelectedAsset] = useState(''),
    [interrupt, setInterrupt] = useState(true),
    [voice, setVoice] = useState('current');
  const [name, setName] = useState('Mi celebración'),
    [kind, setKind] = useState<ReactionKind>('celebrating'),
    [source, setSource] = useState<ReactionAsset['source']>('manual'),
    [tagText, setTagText] = useState('celta, celebración'),
    [duration, setDuration] = useState(3),
    [minimum, setMinimum] = useState(0),
    [maximum, setMaximum] = useState(1),
    [favorite, setFavorite] = useState(false),
    [linkedVideo, setLinkedVideo] = useState('');
  const [references, setReferences] = useState<MotionReference[]>([]),
    [videoFile, setVideoFile] = useState<File | null>(null),
    [videoName, setVideoName] = useState('celebration_big'),
    [videoKind, setVideoKind] = useState<ReactionKind>('celebrating_big'),
    [videoTags, setVideoTags] = useState('referencia, celebración'),
    [videoIntensity, setVideoIntensity] = useState(1),
    [preview, setPreview] = useState('');
  const [repository] = useState(() =>
    session ? new BrowserReferenceRepository() : new ServerReferenceRepository(onState),
  );
  const mounted = useRef(true),
    previewUrl = useRef('');
  const refresh = async () => {
    const list = await repository.list();
    if (mounted.current) setReferences(list);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, [repository]);
  useEffect(() => {
    if (!session && state.motionReferences) setReferences(state.motionReferences);
  }, [state.motionReferences, session]);
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error de Reaction Studio');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function configure(patch: Partial<AvatarEngineSettings>) {
    setPending((p) => ({ ...p, ...patch }));
    try {
      if (!(await send({ type: 'avatar-settings', patch })))
        throw new Error('No se pudo guardar la configuración del avatar');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending((p) => {
        const next = { ...p };
        for (const key of Object.keys(patch) as (keyof AvatarEngineSettings)[])
          if (next[key] === patch[key]) delete next[key];
        return next;
      });
    }
  }
  async function chooseVoice() {
    if (voice === 'current') {
      if (!session && state.voiceStudio?.settings.voiceEnabled) await player.enable();
      return;
    }
    if (session) {
      if (voice === 'browser') {
        const local = localBrowserVoices()[0];
        if (!local) throw new Error('No hay una voz instalada en este navegador');
        session.setVoiceProvider(new BrowserVoiceProvider(local));
      } else
        session.setVoiceProvider(
          voice === 'tone' ? new TestToneVoiceProvider() : new MockVoiceProvider(),
        );
      return;
    }
    await player.command({
      action: 'configure',
      patch: { voiceEnabled: true, defaultVoiceProfile: voice, fallbackVoice: 'simulation' },
    });
    await player.enable();
  }
  async function trigger(reactOnly: boolean, asset?: ReactionAsset) {
    await work(async () => {
      if (!reactOnly) await chooseVoice();
      const intensityValue = asset
        ? Math.max(asset.intensityMin, Math.min(asset.intensityMax, intensity))
        : intensity;
      const ok = await send({
        type: 'avatar-manual',
        interrupt,
        reaction: {
          id: crypto.randomUUID(),
          source: 'Operador · Reaction Studio',
          text,
          emotion: asset ? kindVoice(asset.emotion) : emotion,
          intensity: intensityValue,
          priority,
          interruptible: priority !== 'CRITICAL',
          timestamp: Date.now(),
          reactOnly,
          ...(visualState && !asset ? { avatarState: visualState } : {}),
          ...(animation && !asset ? { animationOverride: animation } : {}),
          ...(asset
            ? { assetId: asset.id, assetKind: asset.emotion, animationOverride: asset.animation }
            : selectedAsset
              ? { assetId: selectedAsset }
              : {}),
          ...(state.currentMatchId ? { matchId: state.currentMatchId } : {}),
        },
      });
      if (!ok) throw new Error('No se pudo activar la reacción');
    });
  }
  async function createAsset() {
    await work(async () => {
      const recipe = builtInReactions.find((a) => a.emotion === kind) ?? builtInReactions[0];
      const asset: ReactionAsset = {
        ...structuredClone(recipe),
        id: crypto.randomUUID(),
        name,
        emotion: kind,
        intensityMin: minimum,
        intensityMax: maximum,
        source,
        tags: tags(tagText),
        durationMs: Math.round(duration * 1000),
        enabled: true,
        favorite,
        priority: 0,
        cooldownMs: 1400,
        status:
          source === 'reference-video'
            ? 'reference-only'
            : source === 'placeholder'
              ? 'placeholder'
              : 'ready',
        createdAt: Date.now(),
        ...(linkedVideo ? { videoReferenceId: linkedVideo } : {}),
      };
      if (!(await send({ type: 'reaction-upsert', asset })))
        throw new Error('No se pudo crear la reacción');
      setSelectedAsset(asset.id);
    });
  }
  async function previewReference(reference: MotionReference) {
    await work(async () => {
      const blob = await repository.read(reference.id);
      if (!mounted.current) return;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      setPreview(previewUrl.current);
    });
  }
  async function deleteReference(id: string) {
    await work(async () => {
      await repository.remove(id);
      if (previewUrl.current) {
        URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = '';
        setPreview('');
      }
      if (session)
        for (const asset of state.reactionLibrary ?? [])
          if (asset.videoReferenceId === id)
            await send({
              type: 'reaction-upsert',
              asset: {
                ...asset,
                videoReferenceId: undefined,
                source: 'placeholder',
                status: 'placeholder',
                enabled: false,
              },
            });
      await refresh();
    });
  }
  const toggles: [keyof AvatarEngineSettings, string][] = [
    ['avatarEnabled', 'Avatar Engine ON/OFF'],
    ['lipSyncEnabled', 'Lip-sync enabled'],
    ['idleAnimationEnabled', 'Idle animation enabled'],
    ['blinkEnabled', 'Blink enabled'],
    ['microMotionEnabled', 'Micro motion enabled'],
    ['reactionRandomization', 'Variantes de reacción'],
    ['videoReferenceEnabled', 'Video reference enabled'],
  ];
  return (
    <div className="reaction-studio">
      <div className="info-banner">
        <b>SamuIA Avatar Engine v9 · imagen oficial animada en 2D</b>
        <p>
          Movimiento localizado, parpadeo y capa de boca con imágenes oficiales. El escenario y el
          micrófono permanecen fijos. Tus vídeos son referencias internas: la extracción de
          movimiento aún está pendiente.
        </p>
      </div>
      {(error || state.avatarStorageError) && (
        <div className="error-text" role="alert">
          {error || state.avatarStorageError}
        </div>
      )}
      <div className="two-col">
        <div>
          <Panel title="Avatar oficial · preview en directo">
            <Avatar
              state={{ ...state, settings: { ...state.settings, studioComposition: 'integrated' } }}
            />
            <div className="settings-body" aria-label="Estado de Avatar Engine">
              <b data-testid="engine-avatar-state">{engine?.currentAvatarState ?? 'idle'}</b>
              <span>
                Emoción: {engine?.currentEmotion} · intensidad:{' '}
                {engine?.currentIntensity.toFixed(2)}
              </span>
              <span data-testid="engine-reaction-asset">
                Animación: {engine?.currentAnimation} · asset:{' '}
                {engine?.currentReactionAsset?.name ?? 'reposo'}
              </span>
              <span>
                Render: {engine?.renderMode} · fase: {engine?.phase} · manual:{' '}
                {engine?.manualOverride ? 'sí' : 'no'}
              </span>
              <span>
                {engine?.isTalking ? 'Hablando' : 'En espera'} ·{' '}
                {engine?.isAnimating ? 'Animación activa' : 'Estático'}
              </span>
              <label>
                Audio / apertura
                <meter
                  data-testid="engine-mouth-level"
                  min={0}
                  max={1}
                  value={engine?.audioLevel ?? 0}
                />
              </label>
              <label>
                Speech progress
                <progress max={1} value={engine?.speechProgress ?? 0} />
              </label>
              <small>
                Fuente de boca: {engine?.lipSyncSource}. Web Speech/simulación usan tiempos de texto
                aproximados; Flite/audio medido usan amplitud. No hay fonemas alineados ni rig 3D.
              </small>
              {engine?.fallbackReason && <small>{engine.fallbackReason}</small>}
            </div>
          </Panel>
          <Panel title="AVATAR TEST / MANUAL REACTION">
            <div className="settings-body">
              <label>
                Text
                <textarea
                  aria-label="Texto de reacción"
                  value={text}
                  maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label>
                Emotion
                <select
                  aria-label="Emoción de reacción"
                  value={emotion}
                  onChange={(e) => setEmotion(e.target.value as VoiceEmotion)}
                >
                  {voiceEmotions.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </label>
              <label>
                Intensity {intensity.toFixed(2)}
                <input
                  aria-label="Intensidad de reacción"
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
                  aria-label="Prioridad de reacción"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as SpeechPriority)}
                >
                  {speechPriorities.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Avatar State
                <select
                  aria-label="Avatar State"
                  value={visualState}
                  onChange={(e) => setVisualState(e.target.value as typeof visualState)}
                >
                  <option value="">Automático por emoción</option>
                  {avatarStates.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Animation override
                <select
                  aria-label="Animation override"
                  value={animation}
                  onChange={(e) => setAnimation(e.target.value as typeof animation)}
                >
                  <option value="">Sin override</option>
                  {avatarAnimations.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label>
                Reaction asset
                <select
                  aria-label="Reaction asset"
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                >
                  <option value="">Selección automática con variantes</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.enabled}>
                      {a.name} · {a.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Voz para la prueba
                <select
                  aria-label="Voz para la prueba"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                >
                  <option value="current">Proveedor actual ({state.voice.provider})</option>
                  <option value="simulation">Simulación sin audio</option>
                  <option value="browser">Voz local del navegador</option>
                  {session ? (
                    <option value="tone">Audio de prueba · tono, no voz</option>
                  ) : (
                    <option
                      value="flite"
                      disabled={
                        !state.voiceStudio?.providers.find((p) => p.id === 'flite')?.available
                      }
                    >
                      Flite · voz local de prueba
                    </option>
                  )}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={interrupt}
                  onChange={(e) => setInterrupt(e.target.checked)}
                />
                Interrumpir reacción anterior si su prioridad lo permite
              </label>
              <div className="button-row">
                <button disabled={busy || !text.trim()} onClick={() => void trigger(false)}>
                  SPEAK + REACT
                </button>
                <button disabled={busy} onClick={() => void trigger(true)}>
                  REACT ONLY
                </button>
                <button onClick={() => void send({ type: 'avatar-stop', reset: false })}>
                  STOP ANIMATION
                </button>
                <button onClick={() => void send({ type: 'avatar-stop', reset: true })}>
                  RESET TO IDLE
                </button>
                <button onClick={() => void send({ type: 'control', action: 'silence' })}>
                  Callar voz y avatar
                </button>
              </div>
              <small>
                STOP ANIMATION cierra la animación visual actual; Callar también cancela la voz. Las
                reacciones CRITICAL protegidas no se cortan automáticamente.
              </small>
              <div className="button-row">
                {(
                  ['goal', 'chance', 'missed_chance', 'penalty', 'var', 'yellow', 'red'] as const
                ).map((eventType) => (
                  <button
                    key={eventType}
                    disabled={state.dataMode === 'LIVE' || !state.currentMatchId}
                    onClick={() =>
                      state.currentMatchId &&
                      void send({
                        type: 'event',
                        matchId: state.currentMatchId,
                        eventType,
                        side: 'home',
                      })
                    }
                  >
                    Partido: {eventType}
                  </button>
                ))}
              </div>
              <small>
                Estos eventos SIMULATION pasan por el CommentaryEngine. LIVE usa únicamente hechos
                recibidos del proveedor.
              </small>
            </div>
          </Panel>
        </div>
        <div>
          <Panel title="Configuración persistente del avatar">
            <div className="settings-body">
              {toggles.map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={label}
                    type="checkbox"
                    checked={settings[key] as boolean}
                    onChange={(e) => void configure({ [key]: e.target.checked })}
                  />
                </label>
              ))}
              <label>
                Render mode
                <select
                  aria-label="Render mode"
                  value={settings.defaultRenderMode}
                  onChange={(e) =>
                    void configure({
                      defaultRenderMode: e.target
                        .value as AvatarEngineSettings['defaultRenderMode'],
                    })
                  }
                >
                  {renderModes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                      {['motion-driven', 'future-advanced'].includes(m)
                        ? ' · preparado, fallback 2D'
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Idle style
                <select
                  value={settings.defaultIdleStyle}
                  onChange={(e) =>
                    void configure({ defaultIdleStyle: e.target.value as 'calm' | 'breathing' })
                  }
                >
                  <option value="calm">Calma</option>
                  <option value="breathing">Respiración suave</option>
                </select>
              </label>
              <label>
                Talk style
                <select
                  value={settings.defaultTalkStyle}
                  onChange={(e) =>
                    void configure({ defaultTalkStyle: e.target.value as 'subtle' | 'expressive' })
                  }
                >
                  <option value="subtle">Sutil</option>
                  <option value="expressive">Expresivo</option>
                </select>
              </label>
              <label>
                Celebration boost
                <input
                  aria-label="Celebration boost"
                  type="number"
                  min="1"
                  max="1.5"
                  step="0.05"
                  value={settings.celebrationIntensityBoost}
                  onChange={(e) =>
                    void configure({ celebrationIntensityBoost: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Reaction cooldown (s)
                <input
                  aria-label="Reaction cooldown"
                  type="number"
                  min="0"
                  max="30"
                  step="0.1"
                  value={settings.reactionCooldown}
                  onChange={(e) => void configure({ reactionCooldown: Number(e.target.value) })}
                />
              </label>
              <small>
                {session
                  ? 'Ajustes y recetas guardados en este navegador; vídeos en IndexedDB.'
                  : 'Ajustes, recetas y referencias guardados en el servidor privado.'}{' '}
                Desactivar el motor o elegir static conserva la imagen oficial estática.
              </small>
            </div>
          </Panel>
          <Panel title="Crear reacción reutilizable">
            <div className="settings-body">
              <label>
                Nombre de reacción
                <input
                  aria-label="Nombre de reacción"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Tipo / emoción
                <select
                  aria-label="Tipo de asset"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ReactionKind)}
                >
                  {reactionKinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Origen
                <select
                  aria-label="Origen de reacción"
                  value={source}
                  onChange={(e) => setSource(e.target.value as typeof source)}
                >
                  <option value="built-in">built-in · receta predefinida</option>
                  <option value="manual">manual animation · receta 2D</option>
                  <option value="reference-video">video reference · extracción pendiente</option>
                  <option value="placeholder">placeholder</option>
                </select>
              </label>
              <label>
                Tags
                <input
                  value={tagText}
                  maxLength={500}
                  onChange={(e) => setTagText(e.target.value)}
                />
              </label>
              <label>
                Intensidad mínima
                <input
                  aria-label="Intensidad mínima de asset"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={minimum}
                  onChange={(e) => setMinimum(Number(e.target.value))}
                />
              </label>
              <label>
                Intensidad máxima
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={maximum}
                  onChange={(e) => setMaximum(Number(e.target.value))}
                />
              </label>
              <label>
                Duración (s)
                <input
                  aria-label="Duración de reacción"
                  type="number"
                  min="0.5"
                  max="30"
                  step="0.1"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <label>
                Vincular referencia
                <select
                  aria-label="Vincular referencia"
                  value={linkedVideo}
                  onChange={(e) => setLinkedVideo(e.target.value)}
                >
                  <option value="">Sin vídeo</option>
                  {references.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={favorite}
                  onChange={(e) => setFavorite(e.target.checked)}
                />
                Favorita
              </label>
              <button
                disabled={busy || !name.trim() || (source === 'reference-video' && !linkedVideo)}
                onClick={() => void createAsset()}
              >
                Crear reacción
              </button>
              <small>
                Las recetas usan movimientos 2D acotados. Una referencia de vídeo no se ejecuta como
                animación hasta que exista un extractor de movimiento.
              </small>
            </div>
          </Panel>
        </div>
      </div>
      <Panel title="REACTION LIBRARY">
        <div className="reaction-library">
          {assets.map((asset) => (
            <article className="reaction-asset" key={asset.id} data-testid={`reaction-${asset.id}`}>
              <b>{asset.name}</b>
              <small>
                {asset.emotion} · {asset.intensityMin.toFixed(2)}–{asset.intensityMax.toFixed(2)} ·{' '}
                {(asset.durationMs / 1000).toFixed(1)} s
              </small>
              <small>
                {asset.source} · {asset.status} · {asset.tags.join(', ')}
              </small>
              <label>
                Activa
                <input
                  type="checkbox"
                  checked={asset.enabled}
                  onChange={(e) => void updateAsset(asset, { enabled: e.target.checked })}
                />
              </label>
              <label>
                Favorita
                <input
                  type="checkbox"
                  checked={asset.favorite}
                  onChange={(e) => void updateAsset(asset, { favorite: e.target.checked })}
                />
              </label>
              <label>
                Prioridad
                <input
                  aria-label={`Prioridad ${asset.id}`}
                  type="number"
                  min="-10"
                  max="10"
                  value={asset.priority}
                  onChange={(e) => void updateAsset(asset, { priority: Number(e.target.value) })}
                />
              </label>
              <div className="button-row">
                <button disabled={busy || !asset.enabled} onClick={() => void trigger(true, asset)}>
                  Probar {asset.name}
                </button>
                <button onClick={() => void send({ type: 'reaction-remove', id: asset.id })}>
                  Eliminar {asset.name}
                </button>
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="VIDEO REFERENCE LIBRARY">
        <div className="settings-body">
          <p>
            Vídeos privados para catalogación y futura extracción de movimiento. Nunca se incorporan
            como vídeo visible al avatar, al compositor ni a la emisión.
          </p>
          <label>
            Nombre del vídeo
            <input
              aria-label="Nombre del vídeo"
              value={videoName}
              maxLength={80}
              onChange={(e) => setVideoName(e.target.value)}
            />
          </label>
          <label>
            Emoción del vídeo
            <select
              aria-label="Emoción del vídeo"
              value={videoKind}
              onChange={(e) => setVideoKind(e.target.value as ReactionKind)}
            >
              {reactionKinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Intensidad del vídeo
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={videoIntensity}
              onChange={(e) => setVideoIntensity(Number(e.target.value))}
            />
          </label>
          <label>
            Tags del vídeo
            <input
              value={videoTags}
              maxLength={500}
              onChange={(e) => setVideoTags(e.target.value)}
            />
          </label>
          <input
            aria-label="Subir vídeo de referencia"
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mov"
            disabled={!settings.videoReferenceEnabled || busy}
            onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
          />
          <button
            disabled={!videoFile || busy || !settings.videoReferenceEnabled || !videoName.trim()}
            onClick={() =>
              void work(async () => {
                await repository.upload(videoFile!, {
                  name: videoName,
                  emotion: videoKind,
                  intensity: videoIntensity,
                  tags: tags(videoTags),
                  enabled: true,
                });
                setVideoFile(null);
                await refresh();
              })
            }
          >
            Guardar referencia de vídeo
          </button>
          <small>
            MP4, WebM o MOV compatibles · máximo 100 MiB por archivo, 60 referencias y 1 GiB total.
            Los vídeos conservan sus bytes; no se extrae movimiento automáticamente.
          </small>
          <div className="reference-list">
            {references.map((ref) => (
              <article className="reaction-asset" key={ref.id}>
                <b>{ref.name}</b>
                <small>
                  {ref.emotion} · {ref.duration.toFixed(2)} s · {ref.status} · {ref.tags.join(', ')}
                </small>
                <label>
                  Referencia activa
                  <input
                    type="checkbox"
                    checked={ref.enabled}
                    onChange={(e) =>
                      void work(async () => {
                        await repository.update(ref.id, {
                          name: ref.name,
                          emotion: ref.emotion,
                          intensity: ref.intensity,
                          tags: ref.tags,
                          enabled: e.target.checked,
                        });
                        await refresh();
                      })
                    }
                  />
                </label>
                <div className="button-row">
                  <button
                    disabled={busy || !settings.videoReferenceEnabled}
                    onClick={() => void previewReference(ref)}
                  >
                    Previsualizar {ref.name}
                  </button>
                  <button
                    disabled={!settings.videoReferenceEnabled || !ref.enabled}
                    onClick={() => {
                      setLinkedVideo(ref.id);
                      setName(ref.name);
                      setKind(ref.emotion);
                      setSource('reference-video');
                    }}
                  >
                    Vincular {ref.name} a una reacción
                  </button>
                  <button disabled={busy} onClick={() => void deleteReference(ref.id)}>
                    Eliminar vídeo {ref.name}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {preview && (
            <div className="reference-preview">
              <b>Referencia interna · NO es la salida del avatar</b>
              <video
                key={preview}
                src={preview}
                controls
                muted
                playsInline
                preload="metadata"
                aria-label="Previsualización privada de referencia"
              />
              <button
                onClick={() => {
                  URL.revokeObjectURL(previewUrl.current);
                  previewUrl.current = '';
                  setPreview('');
                }}
              >
                Cerrar referencia
              </button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

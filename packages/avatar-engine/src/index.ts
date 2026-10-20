import type { AvatarAnimationFrame } from '../../shared/src/avatar';
import type { ReactionEvent, VoiceEmotion } from '../../voice/src/contracts';
import {
  defaultAvatarSettings,
  type AvatarEngineSnapshot,
  type AvatarEngineSettings,
  type AvatarVisualState,
  type ReactionAsset,
  type ReactionKind,
} from './contracts';
export * from './contracts';
const baseMotion = { tilt: 0.6, sway: 1.4, bounce: 0, breathe: 1.2, mouthGain: 1 };
const definitions: [ReactionKind, string, Partial<ReactionAsset['motion']>, number][] = [
  ['neutral', 'idle_breath', { tilt: 0.3, sway: 0.7 }, 5000],
  ['talking', 'talk_soft', {}, 4000],
  ['talking', 'talk_nod', { tilt: 0.9 }, 4000],
  ['happy', 'happy_nod', { tilt: 1, bounce: 0.5 }, 2500],
  ['happy', 'happy_soft', { sway: 2 }, 2500],
  ['laughing', 'laugh_soft', { bounce: 2.5, tilt: 1.1 }, 2500],
  ['laughing', 'laugh_nod', { bounce: 2, tilt: -1 }, 2500],
  ['surprised', 'surprised_soft', { tilt: -1.2, bounce: 1 }, 2200],
  ['surprised', 'surprised_big', { tilt: 1.5, bounce: 2 }, 2500],
  ['thinking', 'thinking_nod', { tilt: -1, sway: 0.7 }, 4000],
  ['thinking', 'thinking_side', { tilt: 1, sway: 0.6 }, 4000],
  ['tense', 'tense_watch', { tilt: -0.6, sway: 0.5 }, 4500],
  ['tense', 'tense_last_minute', { tilt: 0.7, sway: 0.4 }, 4500],
  ['frustrated', 'frustrated_shake', { tilt: -1.6, sway: 3 }, 3000],
  ['frustrated', 'frustrated_drop', { tilt: 1.6, bounce: -1 }, 3000],
  ['angry', 'angry_ref_decision', { tilt: -1.3, sway: 2.2 }, 2800],
  ['angry', 'angry_general', { tilt: 1.2, sway: 2 }, 2800],
  ['sad', 'sad_drop', { tilt: -1, sway: 0.4, breathe: 0.6 }, 3500],
  ['celebrating', 'celebrate_small_01', { tilt: 1.3, bounce: 2, sway: 2 }, 2600],
  ['celebrating', 'celebrate_normal_01', { tilt: -1.5, bounce: 3, sway: 2.5 }, 3000],
  ['celebrating_big', 'celebrate_big_01', { tilt: 2, bounce: 4, sway: 3 }, 3500],
  ['celebrating_big', 'celebrate_big_02', { tilt: -2, bounce: 4, sway: 3 }, 3500],
  ['goal_against', 'goal_against_drop', { tilt: -1.5, bounce: -1, sway: 1 }, 3000],
  ['penalty', 'tense_penalty', { tilt: 0.8, sway: 0.5 }, 4500],
  ['disbelief', 'disbelief_01', { tilt: -1.6, sway: 3 }, 3000],
];
const clips: Record<ReactionKind, ReactionAsset['animation']> = {
  neutral: 'idle',
  talking: 'talking',
  happy: 'happy',
  laughing: 'laugh',
  surprised: 'shock',
  thinking: 'thinking',
  tense: 'var',
  frustrated: 'frustrated',
  angry: 'angry',
  sad: 'loss',
  celebrating: 'goal',
  celebrating_big: 'goal',
  goal_against: 'frustrated',
  penalty: 'penalty',
  disbelief: 'shock',
};
export const builtInReactions: ReactionAsset[] = definitions.map(
  ([emotion, id, motion, durationMs]) => ({
    id,
    name: id,
    emotion,
    intensityMin: emotion === 'celebrating_big' ? 0.7 : 0,
    intensityMax: 1,
    animation: clips[emotion],
    source: 'built-in',
    tags: [emotion, '2d-scripted'],
    durationMs,
    compatibleRenderModes: ['animated-2d', 'static'],
    enabled: true,
    favorite: false,
    priority: 0,
    cooldownMs: 1400,
    status: 'ready',
    motion: { ...baseMotion, ...motion },
    createdAt: 0,
  }),
);
export class ReactionLibrary {
  private assets = structuredClone(builtInReactions);
  private lastUsed = new Map<string, number>();
  private previous = '';
  private previousByKind = new Map<ReactionKind, string>();
  private sequence = 0;
  private lastAt = -Infinity;
  snapshot() {
    return structuredClone(this.assets);
  }
  replace(assets: ReactionAsset[]) {
    this.assets = structuredClone(assets);
  }
  upsert(asset: ReactionAsset) {
    const index = this.assets.findIndex((a) => a.id === asset.id);
    if (index < 0) {
      if (this.assets.length >= 150) throw new Error('Límite de reacciones alcanzado');
      this.assets.push(structuredClone(asset));
    } else this.assets[index] = structuredClone(asset);
  }
  remove(id: string) {
    this.assets = this.assets.filter((a) => a.id !== id);
    this.lastUsed.delete(id);
  }
  choose(
    kind: ReactionKind,
    intensity: number,
    settings: AvatarEngineSettings,
    now: number,
    options: { assetId?: string; critical?: boolean; manual?: boolean } = {},
  ) {
    const requested = options.assetId
      ? this.assets.find((a) => a.id === options.assetId)
      : undefined;
    const usable = (a: ReactionAsset) =>
      a.enabled &&
      a.status === 'ready' &&
      a.source !== 'reference-video' &&
      a.compatibleRenderModes.includes('animated-2d');
    let reason: string | null = null;
    if (requested && !usable(requested))
      reason = 'La referencia no contiene movimiento extraído; se usa una reacción 2D.';
    if (requested && usable(requested)) {
      this.record(requested, now);
      return { asset: structuredClone(requested), reason };
    }
    if (
      !options.critical &&
      !options.manual &&
      now - this.lastAt < settings.reactionCooldown * 1000
    )
      return { asset: null, reason: 'Cooldown de reacciones' };
    const fallbackKind: Partial<Record<ReactionKind, ReactionKind>> = {
      celebrating_big: 'celebrating',
      goal_against: 'frustrated',
      penalty: 'tense',
      disbelief: 'surprised',
    };
    const eligible = (category: ReactionKind) =>
      this.assets.filter(
        (a) =>
          usable(a) &&
          a.emotion === category &&
          a.intensityMin <= intensity &&
          a.intensityMax >= intensity &&
          now - (this.lastUsed.get(a.id) ?? -Infinity) >= a.cooldownMs,
      );
    let candidates = eligible(kind);
    if (!candidates.length && fallbackKind[kind]) candidates = eligible(fallbackKind[kind]!);
    if (!candidates.length) {
      candidates = eligible('neutral');
      reason = reason ?? 'Sin asset específico disponible; fallback de reposo';
    }
    if (!candidates.length)
      return { asset: null, reason: reason ?? 'Sin assets activos compatibles' };
    const previous = this.previousByKind.get(candidates[0]?.emotion) ?? this.previous;
    if (candidates.length > 1) candidates = candidates.filter((a) => a.id !== previous);
    candidates.sort(
      (a, b) =>
        b.priority + Number(b.favorite) * 5 - (a.priority + Number(a.favorite) * 5) ||
        a.id.localeCompare(b.id),
    );
    this.sequence++;
    const seed = (Math.imul(this.sequence, 1664525) + 1013904223) >>> 0;
    const weights = candidates.map((a) => Math.max(1, 11 + a.priority + Number(a.favorite) * 5));
    let target = seed % weights.reduce((a, b) => a + b, 0),
      index = 0;
    if (settings.reactionRandomization)
      for (; index < weights.length - 1; index++) {
        target -= weights[index];
        if (target < 0) break;
      }
    const asset = candidates[index];
    this.record(asset, now);
    return { asset: structuredClone(asset), reason };
  }
  private record(asset: ReactionAsset, now: number) {
    this.lastUsed.set(asset.id, now);
    this.previous = asset.id;
    this.previousByKind.set(asset.emotion, asset.id);
    this.lastAt = now;
  }
}
export function kindForReaction(
  reaction: ReactionEvent | undefined,
  frame: AvatarAnimationFrame,
): ReactionKind {
  if (reaction?.assetKind) return reaction.assetKind;
  if (frame.requestedAnimation === 'penalty') return 'penalty';
  if (reaction?.emotion === 'celebrating')
    return reaction.intensity >= 0.85 ? 'celebrating_big' : 'celebrating';
  if (reaction?.emotion === 'frustrated' && reaction.source === 'match:goal') return 'goal_against';
  if (reaction) return reaction.emotion === 'excited' ? 'surprised' : reaction.emotion;
  return (
    {
      idle: 'neutral',
      talking: 'talking',
      happy: 'happy',
      goal: 'celebrating',
      shock: 'surprised',
      angry: 'angry',
      laugh: 'laughing',
      frustrated: 'frustrated',
      thinking: 'thinking',
      var: 'tense',
      penalty: 'penalty',
      win: 'celebrating',
      loss: 'sad',
    } as const
  )[frame.requestedAnimation];
}
export function makeAvatarEngine(
  settings: AvatarEngineSettings = defaultAvatarSettings,
  asset: ReactionAsset | null = null,
  reaction?: ReactionEvent,
  fallbackReason: string | null = null,
): AvatarEngineSnapshot {
  const actual = settings.defaultRenderMode === 'static' ? 'static' : 'animated-2d';
  return {
    avatarEnabled: settings.avatarEnabled,
    currentAvatarState: 'idle',
    currentEmotion: reaction?.emotion ?? 'neutral',
    currentIntensity: reaction?.intensity ?? 0.35,
    currentAnimation: asset?.id ?? 'idle',
    currentReactionAsset: asset,
    lipSyncEnabled: settings.lipSyncEnabled,
    audioLevel: 0,
    speechProgress: 0,
    isTalking: false,
    isAnimating: false,
    manualOverride: reaction?.source.startsWith('Operador') ?? false,
    renderMode: actual,
    requestedRenderMode: settings.defaultRenderMode,
    phase: 'idle',
    lipSyncSource: 'none',
    currentText: reaction?.text ?? '',
    fallbackReason:
      actual !== settings.defaultRenderMode
        ? 'Renderer avanzado pendiente; se utiliza animated-2d'
        : fallbackReason,
    settings: structuredClone(settings),
    reactionId: reaction?.id,
    priority: reaction?.priority,
    manualState: reaction?.avatarState,
  };
}
const emotionState: Record<VoiceEmotion, AvatarVisualState> = {
  neutral: 'talking',
  happy: 'happy',
  excited: 'surprised',
  celebrating: 'celebrating',
  surprised: 'surprised',
  angry: 'angry',
  frustrated: 'frustrated',
  laughing: 'happy',
  thinking: 'thinking',
  tense: 'tense',
  sad: 'sad',
};
export function sampleAvatarEngine(
  frame: AvatarAnimationFrame,
  position: number,
  now: number,
): AvatarEngineSnapshot | undefined {
  if (!frame.engine) return undefined;
  const base = frame.engine,
    settings = base.settings,
    enabled = settings.avatarEnabled;
  const active = now < frame.reactionUntil,
    speaking = enabled && frame.speaking;
  const state: AvatarVisualState = !enabled
    ? 'idle'
    : frame.speech?.playback === 'preparing'
      ? 'thinking'
      : active
        ? (base.manualState ??
          (frame.requestedAnimation === 'idle'
            ? 'idle'
            : (emotionState[base.currentEmotion] ?? 'thinking')))
        : speaking
          ? 'talking'
          : 'idle';
  const intensity = Math.max(
    0,
    Math.min(
      1,
      (base.currentIntensity || frame.intensity) *
        (state === 'celebrating' ? settings.celebrationIntensityBoost : 1) *
        (base.priority === 'CRITICAL' ? 1.12 : base.priority === 'HIGH' ? 1.06 : 1),
    ),
  );
  return {
    ...base,
    manualOverride: base.manualOverride && active,
    avatarEnabled: enabled,
    currentAvatarState: state,
    currentIntensity: intensity,
    currentAnimation: active ? (base.currentReactionAsset?.id ?? frame.requestedAnimation) : state,
    isTalking: speaking,
    isAnimating:
      enabled &&
      base.renderMode === 'animated-2d' &&
      (active || speaking || settings.idleAnimationEnabled),
    audioLevel: speaking ? frame.mouth.open : 0,
    speechProgress: frame.speech ? Math.min(1, position / Math.max(1, frame.speech.durationMs)) : 0,
    lipSyncSource: speaking ? (frame.speech?.source ?? 'text-simulation') : 'none',
    currentText: frame.speech?.text ?? (active ? base.currentText : ''),
    phase: !enabled
      ? 'disabled'
      : active
        ? now - frame.startedAt < 180
          ? 'transitioning'
          : base.manualOverride
            ? 'manual-triggered'
            : 'active'
        : now - frame.reactionUntil < settings.reactionCooldown * 1000
          ? 'cooldown'
          : 'idle',
  };
}

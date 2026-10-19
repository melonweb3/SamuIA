import {
  type Camera,
  type Scene,
  type ReactionDecision,
  type AvatarState,
} from '../../shared/src/index';
export const officialAvatarFiles = [
  'avatar_cara_01.png',
  'avatar_cara_02.png',
  'avatar_cara_03.png',
  'avatar_cara_04.png',
  'avatar_cara_05.png',
] as const;
export type OfficialAvatarFile = (typeof officialAvatarFiles)[number];
export const officialAvatarDescriptions: Record<OfficialAvatarFile, string> = {
  'avatar_cara_01.png': 'Sonrisa · original 01',
  'avatar_cara_02.png': 'Pensativo · original 02',
  'avatar_cara_03.png': 'Neutral · original 03',
  'avatar_cara_04.png': 'Habla · original 04',
  'avatar_cara_05.png': 'Serio · original 05',
};
export const avatarAssets = {
  neutral: 'avatar_cara_03.png',
  sonrisa: 'avatar_cara_01.png',
  hablando: 'avatar_cara_04.png',
  risa: 'avatar_cara_01.png',
  sorpresa: 'avatar_cara_03.png',
  pensativo: 'avatar_cara_02.png',
  serio: 'avatar_cara_05.png',
  enfadado_leve: 'avatar_cara_05.png',
  tres_cuartos_izquierda: 'avatar_cara_03.png',
  tres_cuartos_derecha: 'avatar_cara_03.png',
  plano_medio: 'avatar_cara_03.png',
  streamer: 'avatar_cara_03.png',
} as const;
/** Only originals of the same character; absent expressions use an existing reference. */
export function selectOfficialAvatar(
  state: AvatarState,
  profileAvatar = 'official',
): OfficialAvatarFile {
  if (officialAvatarFiles.includes(profileAvatar as OfficialAvatarFile))
    return profileAvatar as OfficialAvatarFile;
  if (state.gesture === 'celebracion') return avatarAssets.sonrisa;
  if (state.emotion === 'pensativo' || state.gesture === 'mano_barbilla')
    return avatarAssets.pensativo;
  if (state.emotion === 'serio' || state.emotion === 'enfadado_leve') return avatarAssets.serio;
  if (state.emotion === 'sonrisa' || state.emotion === 'risa') return avatarAssets.sonrisa;
  return state.speaking ? avatarAssets.hablando : avatarAssets.neutral;
}
export class CameraDirector {
  current: Camera = 'streamer';
  lastChangeAt = -Infinity;
  receive(camera: Camera, now: number, cooldown: number) {
    if (camera !== this.current && now - this.lastChangeAt >= cooldown * 1000) {
      this.current = camera;
      this.lastChangeAt = now;
    }
    return this.current;
  }
  reset() {
    this.current = 'streamer';
    this.lastChangeAt = -Infinity;
  }
}
export class SceneManager {
  current: Scene = 'futbol';
  receive(scene: Scene) {
    this.current = scene;
  }
}
export class MockVoiceProvider {
  durationMs(text: string) {
    return Math.max(1800, Math.min(18000, text.length * 38));
  }
  async speak(input: { text: string; emotion: ReactionDecision['emotion']; energy: number }) {
    return { durationMs: this.durationMs(input.text) };
  }
  stop() {
    /* Explicit simulated playback cancellation. */
  }
}

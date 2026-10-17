import { type Camera, type Scene, type ReactionDecision } from '../../shared/src/index';
export const avatarAssets = {
  neutral: 'neutral.png',
  sonrisa: 'smile.png',
  hablando: 'talking.png',
  risa: 'laugh.png',
  sorpresa: 'surprised.png',
  pensativo: 'thinking.png',
  serio: 'serious.png',
  enfadado_leve: 'angry.png',
  tres_cuartos_izquierda: 'three-quarter-left.png',
  tres_cuartos_derecha: 'three-quarter-right.png',
  plano_medio: 'medium.png',
  streamer: 'streamer.png',
};
export const sceneAssets: Record<Scene, string> = {
  charlando: 'chat.png',
  futbol: 'football.png',
  gaming: 'gaming.png',
  tecnologia: 'tech.png',
  enfado: 'angry-red.png',
  celebracion: 'celebration.png',
};
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

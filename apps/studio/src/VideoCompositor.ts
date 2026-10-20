import type { Composition, StudioSnapshot } from '../../../packages/shared/src/index';
import { studioScenery } from '../../../packages/core/src/scenery';
import {
  sampleAvatarFrame,
  type AvatarRendererAdapter,
  type AvatarRendererFactory,
} from '../../../packages/avatar-animation/src/index';
import { sceneSource } from './StudioScenery';
import { OfficialImageRenderer } from './OfficialImageRenderer';
export interface CompositorAvatarAdapter extends AvatarRendererAdapter {
  renderToCanvas?(
    context: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
  ): void;
}
/** Draw only our assets, graphics and commentary. No screen, match-video or microphone capture. */
export class VideoCompositor {
  readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private image: HTMLImageElement | null = null;
  private imageSource = '';
  private state: StudioSnapshot;
  private receivedAt = performance.now();
  private renderer: CompositorAvatarAdapter | null = null;
  private officialRenderer = new OfficialImageRenderer();
  private raf = 0;
  private lastFrameAt = 0;
  constructor(
    readonly composition: Composition,
    state: StudioSnapshot,
    factory?: AvatarRendererFactory | null,
  ) {
    this.state = state;
    this.canvas.width = composition === 'landscape' ? 1280 : 720;
    this.canvas.height = composition === 'landscape' ? 720 : 1280;
    this.context = this.canvas.getContext('2d', { alpha: false })!;
    if (factory) {
      const candidate = factory(document.createElement('div')) as CompositorAvatarAdapter;
      if (candidate.renderToCanvas) this.renderer = candidate;
      else candidate.dispose();
    }
    const tick = (now: number) => {
      if (now - this.lastFrameAt >= 1000 / 25) {
        this.draw(now);
        this.lastFrameAt = now;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  update(state: StudioSnapshot) {
    this.state = state;
    this.receivedAt = performance.now();
  }
  private text(
    text: string,
    x: number,
    y: number,
    width: number,
    size = 26,
    lines = 5,
    color = '#e7f3f4',
  ) {
    const ctx = this.context;
    ctx.fillStyle = color;
    ctx.font = `${size}px sans-serif`;
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    let line = '',
      row = 0;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        ctx.fillText(line, x, y + row * size * 1.4);
        line = word;
        row++;
        if (row >= lines - 1) break;
      } else line = next;
    }
    if (row < lines) ctx.fillText(line, x, y + row * size * 1.4);
  }
  private draw(now: number) {
    const ctx = this.context,
      state = this.state,
      vertical = this.composition === 'portrait',
      width = this.canvas.width;
    const scene = studioScenery(
      this.renderer
        ? { ...state, settings: { ...state.settings, studioComposition: 'portrait' } }
        : { ...state, settings: { ...state.settings, studioComposition: 'integrated' } },
    );
    const source = sceneSource(scene.file);
    if (source && source !== this.imageSource) {
      this.imageSource = source;
      this.image = new Image();
      this.image.src = source;
    }
    ctx.fillStyle = '#0b151d';
    ctx.fillRect(0, 0, width, this.canvas.height);
    ctx.fillStyle = '#173341';
    ctx.fillRect(24, 24, width - 48, vertical ? 120 : 82);
    const m = scene.match;
    this.text(
      m
        ? `${m.home.shortName}  ${m.score.home} – ${m.score.away}  ${m.away.shortName}`
        : 'SamuIA · Esperando partido',
      40,
      vertical ? 68 : 63,
      width - 80,
      vertical ? 30 : 34,
      1,
    );
    this.text(
      m
        ? `${m.minute}′ · ${scene.competition} · ${state.dataMode}`
        : `Programa propio · ${state.dataMode}`,
      40,
      vertical ? 113 : 91,
      width - 80,
      18,
      1,
      '#96cbd0',
    );
    const bounds = {
      x: 24,
      y: vertical ? 170 : 130,
      width: vertical ? 672 : 820,
      height: vertical ? 378 : 462,
    };
    const frame = sampleAvatarFrame(
      state.animation,
      state.animation.sampledAt + Math.max(0, now - this.receivedAt),
    );
    if (!this.renderer && this.officialRenderer.render(ctx, bounds, scene.file, frame)) {
      /* The same renderer feeds preview and encoder. */
    } else if (this.image?.complete && this.image.naturalWidth)
      ctx.drawImage(this.image, bounds.x, bounds.y, bounds.width, bounds.height);
    else this.text('Cargando escenario oficial…', 40, bounds.y + 70, bounds.width - 40);
    if (this.renderer) {
      this.renderer.update(frame);
      this.renderer.renderToCanvas!(ctx, bounds);
    }
    const cx = vertical ? 24 : 870,
      cy = vertical ? 580 : 130,
      cw = vertical ? 672 : 386;
    ctx.fillStyle = '#132832';
    ctx.fillRect(cx, cy, cw, vertical ? 310 : 462);
    this.text('SAMUIA COMENTA', cx + 20, cy + 36, cw - 40, 20, 1, '#77e0c4');
    this.text(
      state.decision.say ||
        state.history[0]?.decision.say ||
        'Vamos a vivir el partido con la comunidad.',
      cx + 20,
      cy + 86,
      cw - 40,
      vertical ? 28 : 25,
      vertical ? 5 : 8,
    );
    this.text(
      `${frame.animation} · ${frame.expression}`,
      cx + 20,
      cy + (vertical ? 280 : 430),
      cw - 40,
      18,
      1,
      '#9bd2d7',
    );
    const below = vertical ? 935 : 632;
    this.text(
      this.renderer
        ? 'Avatar animado conectado'
        : frame.engine?.avatarEnabled && frame.engine.renderMode === 'animated-2d'
          ? 'Avatar oficial · animación 2D v9'
          : 'Avatar oficial · fallback estático',
      24,
      vertical ? below : below - 15,
      width - 48,
      18,
      1,
      '#a1b4bc',
    );
    const community = state.community;
    this.text(
      community.topics[0]
        ? `Se comenta: ${community.topics[0].topic} · ${community.topics[0].users} participantes`
        : 'La comunidad forma parte de este directo',
      24,
      vertical ? below + 50 : below + 17,
      width - 48,
      22,
      2,
    );
    this.text(
      state.voice.audible
        ? `Voz del comentarista · ${frame.speech?.source === 'audio-amplitude' ? 'amplitud de audio' : 'sincronización aproximada'}`
        : 'Voz simulada · sin audio',
      24,
      vertical ? 1145 : 694,
      width - 48,
      16,
      1,
      '#a1b4bc',
    );
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
    this.officialRenderer.dispose();
  }
}

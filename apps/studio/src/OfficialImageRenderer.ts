import type { AvatarAnimationFrame } from '../../../packages/shared/src/avatar';
import { sceneSource } from './StudioScenery';
import { avatarSource } from './avatar-source';
type Point = { x: number; y: number };
interface Calibration {
  head: Point;
  eyes: [Point, Point];
  mouth: Point;
  body: Point;
  deskY: number;
  mouthWidth: number;
  protected?: { x: number; y: number; rx: number; ry: number };
}
/** Coordinates refer to the archived 1672×941 composites. No pixels/assets are written. */
export const officialImageCalibration: Record<string, Calibration> = {
  'samuia_setup_01.png': {
    head: { x: 846, y: 315 },
    eyes: [
      { x: 824, y: 280 },
      { x: 905, y: 294 },
    ],
    mouth: { x: 851, y: 366 },
    body: { x: 838, y: 595 },
    deskY: 744,
    mouthWidth: 96,
  },
  'samuia_setup_02.png': {
    head: { x: 840, y: 341 },
    eyes: [
      { x: 815, y: 313 },
      { x: 893, y: 327 },
    ],
    mouth: { x: 846, y: 391 },
    body: { x: 836, y: 600 },
    deskY: 730,
    mouthWidth: 90,
    protected: { x: 1180, y: 615, rx: 150, ry: 180 },
  },
  'samuia_setup_03.png': {
    head: { x: 837, y: 301 },
    eyes: [
      { x: 811, y: 267 },
      { x: 889, y: 283 },
    ],
    mouth: { x: 841, y: 357 },
    body: { x: 835, y: 583 },
    deskY: 711,
    mouthWidth: 92,
    protected: { x: 517, y: 566, rx: 125, ry: 100 },
  },
  'samuia_setup_04.png': {
    head: { x: 825, y: 316 },
    eyes: [
      { x: 803, y: 283 },
      { x: 884, y: 298 },
    ],
    mouth: { x: 833, y: 370 },
    body: { x: 810, y: 598 },
    deskY: 745,
    mouthWidth: 93,
    protected: { x: 452, y: 538, rx: 145, ry: 85 },
  },
  'samuia_setup_05.png': {
    head: { x: 837, y: 317 },
    eyes: [
      { x: 815, y: 285 },
      { x: 900, y: 300 },
    ],
    mouth: { x: 842, y: 374 },
    body: { x: 820, y: 586 },
    deskY: 720,
    mouthWidth: 94,
    protected: { x: 1084, y: 592, rx: 145, ry: 120 },
  },
};
const falloff = (x: number, y: number, c: Point, rx: number, ry: number) => {
  const d = ((x - c.x) / rx) ** 2 + ((y - c.y) / ry) ** 2;
  return d >= 1 ? 0 : (1 - d) ** 2;
};
interface Pose {
  shift: number;
  rise: number;
  rotation: number;
  breath: number;
  blink: number;
}
export function deformOfficialPoint(p: Point, rig: Calibration, pose: Pose): Point {
  if (p.y >= rig.deskY) return p;
  const protect = rig.protected
    ? 1 - Math.min(1, falloff(p.x, p.y, rig.protected, rig.protected.rx, rig.protected.ry) * 4)
    : 1;
  const head = falloff(p.x, p.y, rig.head, 175, 200),
    body = falloff(p.x, p.y, rig.body, 280, 160) * protect;
  const dx = p.x - rig.head.x,
    dy = p.y - rig.head.y;
  return {
    x:
      p.x +
      protect * head * (pose.shift - dy * pose.rotation) +
      body * pose.breath * (p.x - rig.body.x) * 0.004,
    y: p.y + protect * head * (pose.rise + dx * pose.rotation) - body * pose.breath,
  };
}
/** Canvas-only renderer shared by stage and encoder composition; cannot accept video URLs. */
export class OfficialImageRenderer {
  readonly name = 'official-image-2d-v9';
  readonly capabilities = {
    headBody: true,
    blink: true,
    lipSync: true,
    expressions: true,
    gaze: false,
  };
  private adapterFrame: AvatarAnimationFrame | null = null;
  private adapterScene = 'samuia_setup_05.png';
  update(frame: AvatarAnimationFrame) {
    this.adapterFrame = frame;
  }
  setScene(file: string) {
    if (officialImageCalibration[file]) this.adapterScene = file;
  }
  renderToCanvas(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
  ) {
    if (this.adapterFrame) this.render(ctx, bounds, this.adapterScene, this.adapterFrame);
  }
  private images = new Map<string, HTMLImageElement>();
  private patches = new Map<string, HTMLCanvasElement>();
  private mouth = 0;
  private lastAt = 0;
  private clip = -1;
  private image(name: string, source: string | null) {
    if (!source) return null;
    let image = this.images.get(name);
    if (!image) {
      image = new Image();
      image.src = source;
      this.images.set(name, image);
    }
    return image.complete && image.naturalWidth ? image : null;
  }
  private triangle(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    s: [Point, Point, Point],
    d: [Point, Point, Point],
  ) {
    const u = { x: s[1].x - s[0].x, y: s[1].y - s[0].y },
      v = { x: s[2].x - s[0].x, y: s[2].y - s[0].y },
      det = u.x * v.y - u.y * v.x;
    if (Math.abs(det) < 0.001) return;
    const du = { x: d[1].x - d[0].x, y: d[1].y - d[0].y },
      dv = { x: d[2].x - d[0].x, y: d[2].y - d[0].y };
    const a = (du.x * v.y - dv.x * u.y) / det,
      b = (du.y * v.y - dv.y * u.y) / det,
      c = (dv.x * u.x - du.x * v.x) / det,
      e = (dv.y * u.x - du.y * v.x) / det;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d[0].x, d[0].y);
    ctx.lineTo(d[1].x, d[1].y);
    ctx.lineTo(d[2].x, d[2].y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, e, d[0].x - a * s[0].x - c * s[0].y, d[0].y - b * s[0].x - e * s[0].y);
    const x = Math.min(...s.map((p) => p.x)),
      y = Math.min(...s.map((p) => p.y)),
      w = Math.max(...s.map((p) => p.x)) - x,
      h = Math.max(...s.map((p) => p.y)) - y;
    ctx.drawImage(image, x, y, w, h, x, y, w, h);
    ctx.restore();
  }
  private mesh(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    rect: { x: number; y: number; w: number; h: number },
    columns: number,
    rows: number,
    map: (p: Point) => Point,
  ) {
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++) {
        const x = rect.x + (rect.w * col) / columns,
          y = rect.y + (rect.h * row) / rows,
          w = rect.w / columns,
          h = rect.h / rows;
        const s: Point[] = [
            { x, y },
            { x: x + w, y },
            { x, y: y + h },
            { x: x + w, y: y + h },
          ],
          d = s.map(map);
        this.triangle(ctx, image, [s[0], s[1], s[2]], [d[0], d[1], d[2]]);
        this.triangle(ctx, image, [s[3], s[2], s[1]], [d[3], d[2], d[1]]);
      }
  }
  private mouthPatch(smile: boolean, base: HTMLImageElement, rig: Calibration, file: string) {
    const key = `${file}:${smile}`;
    const existing = this.patches.get(key);
    if (existing) return existing;
    const source = this.image(
      smile ? 'mouth-smile' : 'mouth-talk',
      avatarSource(smile ? 'avatar_cara_01.png' : 'avatar_cara_04.png'),
    );
    if (!source) return null;
    const patch = document.createElement('canvas');
    patch.width = 240;
    patch.height = 120;
    const c = patch.getContext('2d')!;
    c.drawImage(
      source,
      smile ? 432 : 442,
      smile ? 562 : 582,
      smile ? 260 : 246,
      smile ? 140 : 120,
      0,
      0,
      240,
      120,
    );
    // Match overall illumination using skin at the patch edges, rather than recolouring a face.
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const p = probe.getContext('2d')!;
    p.drawImage(base, rig.mouth.x - 42, rig.mouth.y - 12, 3, 3, 0, 0, 1, 1);
    const target = p.getImageData(0, 0, 1, 1).data,
      original = c.getImageData(12, 12, 1, 1).data;
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = `rgb(${[0, 1, 2].map((i) => Math.round(255 * Math.min(1, target[i] / Math.max(1, original[i])))).join(',')})`;
    c.fillRect(0, 0, 240, 120);
    c.globalCompositeOperation = 'destination-in';
    c.save();
    c.translate(120, 60);
    c.scale(1, 0.5);
    const gradient = c.createRadialGradient(0, 0, 75, 0, 0, 118);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, '#fff0');
    c.fillStyle = gradient;
    c.fillRect(-120, -120, 240, 240);
    c.restore();
    this.patches.set(key, patch);
    return patch;
  }
  render(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    file: string,
    frame: AvatarAnimationFrame,
  ) {
    const rig = officialImageCalibration[file];
    if (!rig) return false;
    const image = this.image(file, sceneSource(file));
    if (!image) return false;
    ctx.save();
    ctx.translate(bounds.x, bounds.y);
    ctx.scale(bounds.width / 1672, bounds.height / 941);
    ctx.drawImage(image, 0, 0, 1672, 941);
    const engine = frame.engine;
    if (!engine?.avatarEnabled || engine.renderMode === 'static') {
      ctx.restore();
      return true;
    }
    const now = frame.sampledAt,
      elapsed = Math.max(0, now - frame.startedAt),
      dt = this.lastAt ? Math.min(100, now - this.lastAt) : 40;
    this.lastAt = now;
    if (this.clip !== frame.clipId) {
      this.clip = frame.clipId;
      this.mouth = 0;
    }
    const settings = engine.settings,
      reacting = now < frame.reactionUntil;
    const motion = reacting ? engine.currentReactionAsset?.motion : undefined;
    const active =
      settings.microMotionEnabled && (reacting || frame.speaking || settings.idleAnimationEnabled);
    const strength = engine.currentIntensity,
      phase = elapsed / 1000;
    const envelope = reacting
      ? Math.min(1, elapsed / 180, Math.max(0, (frame.reactionUntil - now) / 260))
      : 0;
    const idle = settings.idleAnimationEnabled && settings.defaultIdleStyle === 'breathing';
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    const pose: Pose = {
      shift: active ? Math.sin(phase * 1.7) * (motion?.sway ?? 1) * reduced : 0,
      rise: active
        ? (-Math.abs(Math.sin(phase * 6)) * (motion?.bounce ?? 0) * envelope * strength +
            Math.sin(phase * 1.2) * 0.6) *
          reduced
        : 0,
      rotation: active
        ? Math.sin(phase * 1.8) * (motion?.tilt ?? 0.4) * strength * 0.012 * reduced
        : 0,
      breath: active && idle ? Math.sin(phase * 1.7) * (motion?.breathe ?? 1) * reduced : 0,
      blink: settings.blinkEnabled ? frame.blink : 0,
    };
    const map = (p: Point) => deformOfficialPoint(p, rig, pose);
    // Only the character region is redrawn; desk and microphone have zero displacement.
    this.mesh(
      ctx,
      image,
      { x: rig.body.x - 280, y: rig.head.y - 200, w: 560, h: rig.deskY - (rig.head.y - 200) },
      12,
      16,
      map,
    );
    if (pose.blink > 0.01)
      for (const eye of rig.eyes) {
        this.mesh(ctx, image, { x: eye.x - 33, y: eye.y - 19, w: 66, h: 38 }, 4, 12, (p) => {
          const localY = p.y - eye.y,
            eyeFactor = Math.max(0, 1 - Math.abs(p.x - eye.x) / 33);
          const closed =
            Math.abs(localY) <= 7
              ? localY * (1 - 0.93 * pose.blink)
              : Math.sign(localY) *
                (7 * (1 - 0.93 * pose.blink) +
                  ((Math.abs(localY) - 7) * (19 - 7 * (1 - 0.93 * pose.blink))) / 12);
          return map({ x: p.x, y: p.y + (closed - localY) * eyeFactor });
        });
      }
    const target =
      engine.lipSyncEnabled && frame.speaking
        ? Math.min(
            1,
            frame.mouth.open *
              (motion?.mouthGain ?? 1) *
              (settings.defaultTalkStyle === 'expressive' ? 1.2 : 1),
          )
        : 0;
    this.mouth = frame.speaking
      ? this.mouth + (target - this.mouth) * (1 - Math.exp(-Math.max(1, dt) / 55))
      : 0;
    const smile = reacting && ['happy', 'celebrating'].includes(engine.currentAvatarState);
    if (this.mouth > 0.015 || smile) {
      const patch = this.mouthPatch(smile, image, rig, file);
      if (patch) {
        const center = map(rig.mouth),
          open = smile ? Math.max(0.45, this.mouth) : this.mouth;
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(0.09 + pose.rotation);
        ctx.globalAlpha = Math.min(1, open * 5);
        ctx.drawImage(
          patch,
          -rig.mouthWidth / 2,
          -(13 + 30 * open) / 2,
          rig.mouthWidth,
          13 + 30 * open,
        );
        ctx.restore();
      }
    }
    ctx.restore();
    return true;
  }
  dispose() {
    this.images.clear();
    this.patches.clear();
  }
}

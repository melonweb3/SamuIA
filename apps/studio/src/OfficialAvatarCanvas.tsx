import { useEffect, useRef } from 'react';
import type { StudioSnapshot } from '../../../packages/shared/src/index';
import { sampleAvatarFrame } from '../../../packages/avatar-animation/src/index';
import { studioScenery } from '../../../packages/core/src/scenery';
import { OfficialImageRenderer } from './OfficialImageRenderer';
export function OfficialAvatarCanvas({ state }: { state: StudioSnapshot }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    latest = useRef({ state, receivedAt: performance.now() });
  useEffect(() => {
    latest.current = { state, receivedAt: performance.now() };
  }, [state]);
  useEffect(() => {
    const element = canvas.current!,
      ctx = element.getContext('2d')!,
      renderer = new OfficialImageRenderer();
    let raf = 0,
      last = 0;
    const tick = (now: number) => {
      if (now - last >= 40) {
        const { state, receivedAt } = latest.current,
          frame = sampleAvatarFrame(state.animation, state.animation.sampledAt + now - receivedAt),
          scene = studioScenery(state);
        ctx.clearRect(0, 0, element.width, element.height);
        const ready = renderer.render(
          ctx,
          { x: 0, y: 0, width: element.width, height: element.height },
          scene.file,
          frame,
        );
        element.dataset.ready = String(ready);
        element.dataset.state = frame.engine?.currentAvatarState ?? frame.animation;
        element.dataset.mouth = String(frame.engine?.lipSyncEnabled ? frame.mouth.open : 0);
        element.dataset.renderer = 'official-2d-v9';
        element.dataset.sceneFile = scene.file;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, []);
  return (
    <canvas
      ref={canvas}
      width={1003}
      height={565}
      className="official-avatar-canvas"
      data-testid="official-animated-avatar"
      aria-label="Animación 2D del avatar oficial de SamuIA"
    />
  );
}

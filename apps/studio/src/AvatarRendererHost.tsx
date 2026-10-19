import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  sampleAvatarFrame,
  type AvatarRendererFactory,
  type AvatarRendererAdapter,
} from '../../../packages/avatar-animation/src/index';
import type { AvatarAnimationFrame } from '../../../packages/shared/src/index';

const RendererContext = createContext<AvatarRendererFactory | null>(null);
/** Wrap App in this provider to install a Live2D/VRM/WebGL renderer without changing the engines. */
export const AvatarRendererProvider = RendererContext.Provider;
export const useAvatarRendererFactory = () => useContext(RendererContext);
export function useLiveAvatarFrame(frame: AvatarAnimationFrame) {
  const [live, setLive] = useState(frame);
  const source = useRef({ frame, receivedAt: performance.now() });
  useEffect(() => {
    source.current = { frame, receivedAt: performance.now() };
  }, [frame]);
  useEffect(() => {
    let raf = 0,
      last = 0;
    const tick = (now: number) => {
      if (now - last >= 40) {
        const sourceFrame = source.current;
        setLive(
          sampleAvatarFrame(
            sourceFrame.frame,
            sourceFrame.frame.sampledAt + now - sourceFrame.receivedAt,
          ),
        );
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return live;
}
export function AvatarRendererHost({
  frame,
  children,
}: {
  frame: AvatarAnimationFrame;
  children: ReactNode;
}) {
  const factory = useAvatarRendererFactory();
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ frame, receivedAt: performance.now() });
  useEffect(() => {
    latest.current = { frame, receivedAt: performance.now() };
  }, [frame]);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const fallback: AvatarRendererAdapter = {
      name: 'official-image-fallback',
      capabilities: {
        headBody: false,
        blink: false,
        lipSync: false,
        expressions: false,
        gaze: false,
      },
      update(sample) {
        // A subtle whole-portrait preview, never simulated facial rigging on the original photo.
        element.style.setProperty('--avatar-bob', `${sample.body.bob * 12}px`);
        element.style.setProperty('--avatar-roll', `${sample.head.roll * 0.2}deg`);
      },
      dispose() {
        element.style.removeProperty('--avatar-bob');
        element.style.removeProperty('--avatar-roll');
      },
    };
    const renderer = factory ? factory(element) : fallback;
    let raf = 0;
    const tick = (now: number) => {
      const current = latest.current;
      const sample = sampleAvatarFrame(
        current.frame,
        current.frame.sampledAt + now - current.receivedAt,
      );
      renderer.update(sample);
      element.dataset.avatarAnimation = sample.animation;
      element.dataset.renderer = renderer.name;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, [factory]);
  return (
    <div className="avatar-renderer-host" ref={host}>
      {!factory && children}
    </div>
  );
}

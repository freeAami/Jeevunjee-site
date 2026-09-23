import { useEffect, useRef } from 'react';

const FADE = 0.5; // seconds

/**
 * Manual loop from the original brief: fade in over 0.5s at the start, fade out 0.5s before
 * the end, and on `ended` hold at 0 opacity for 100ms before restarting.
 */
export function FadeLoopVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let raf = 0;
    let restart: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const d = v.duration || 0;
      const t = v.currentTime || 0;
      let op = 0;
      if (d > 0) {
        op = 1;
        if (t < FADE) op = t / FADE;
        else if (t > d - FADE) op = Math.max(0, (d - t) / FADE);
      }
      v.style.opacity = String(Math.min(1, op));
      raf = requestAnimationFrame(tick);
    };
    const onEnded = () => {
      v.style.opacity = '0';
      restart = setTimeout(() => {
        v.currentTime = 0;
        v.play().catch(() => {});
      }, 100);
    };

    v.muted = true;
    v.addEventListener('ended', onEnded);
    v.play().catch(() => {});
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(restart);
      v.removeEventListener('ended', onEnded);
    };
  }, [src]);

  return <video ref={ref} src={src} muted playsInline autoPlay preload="auto" aria-hidden="true" tabIndex={-1} />;
}

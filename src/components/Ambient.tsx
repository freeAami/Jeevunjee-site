import { useEffect, useRef } from 'react';

/** Warm glow that trails the pointer. Only runs on devices with a fine pointer. */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    let x = tx, y = ty, raf = 0;
    const onMove = (e: PointerEvent) => { tx = e.clientX; ty = e.clientY; };
    const tick = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      if (ref.current) ref.current.style.transform = `translate(${x - 260}px, ${y - 260}px)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return <div className="cursor-glow" ref={ref} aria-hidden="true" />;
}

/** Soft sage + gold leaf forms drifting behind the whole site. */
export function Botanicals() {
  return (
    <div className="botanicals" aria-hidden="true">
      <svg className="botanical sway" style={{ top: '4%', left: '-4%', width: 380, height: 380, opacity: 0.28 }} viewBox="0 0 200 200" fill="none">
        <path d="M100 20 C 60 60 40 110 60 170 C 90 150 130 130 150 70 C 140 50 120 32 100 20 Z" fill="var(--sage-soft)" opacity="0.55" />
      </svg>
      <svg className="botanical drift" style={{ top: '32%', right: '-6%', width: 420, height: 420, opacity: 0.24 }} viewBox="0 0 200 200" fill="none">
        <path d="M40 180 C 80 140 130 100 180 30 C 170 90 140 140 90 180 C 70 185 50 185 40 180 Z" fill="var(--gold-soft)" opacity="0.4" />
      </svg>
      <svg className="botanical sway" style={{ bottom: '6%', left: '6%', width: 300, height: 300, opacity: 0.24 }} viewBox="0 0 200 200" fill="none">
        <path d="M40 180 C 20 130 30 70 80 30 C 110 70 130 130 100 180 C 80 185 55 185 40 180 Z" fill="var(--sage-soft)" opacity="0.45" />
      </svg>
    </div>
  );
}

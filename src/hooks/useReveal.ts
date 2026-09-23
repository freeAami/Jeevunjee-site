import { useCallback } from 'react';

// One shared observer for every [reveal] element. Elements get `.in` once and are then released.
let observer: IntersectionObserver | null = null;

function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          observer?.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -80px 0px' },
  );
  return observer;
}

/** Callback ref: adds `.in` when the element scrolls into view. */
export function useReveal<T extends Element>() {
  return useCallback((el: T | null) => {
    if (!el) return;
    const io = getObserver();
    if (!io) {
      el.classList.add('in');
      return;
    }
    io.observe(el);
    return () => io.unobserve(el);
  }, []);
}

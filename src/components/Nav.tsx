import { useEffect, useState } from 'react';
import { navItems } from '../content';

export function Nav({ onApply }: { onApply: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className="nav" aria-label="Main">
      <div className={`liquid-glass nav-pill${scrolled ? ' scrolled' : ''}`}>
        <a href="#top" className="logo fade-rise" aria-label="Jeevunjee — back to top">
          Jeevunjee<sup>SL</sup>
        </a>
        <div className="nav-links fade-rise-d1">
          {navItems.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="nav-link">
              {item.label}
            </a>
          ))}
          <a href="#/portal" className="nav-link nav-signin">Sign in</a>
          <button type="button" onClick={onApply} className="liquid-glass cta nav-apply">
            Apply <span className="cta-icon" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

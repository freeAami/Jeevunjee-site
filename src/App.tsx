import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Botanicals, CursorGlow } from './components/Ambient';
import { Hero } from './components/Hero';
import { Nav } from './components/Nav';
import { ApplyBand, Family, Footer, HowItWorks, Mission, WhoWeSupport } from './components/Sections';
import { Journey } from './journey/Journey';

// The trustee/student portal lives at #/portal and is only downloaded when someone goes there.
const PortalApp = lazy(() => import('./portal/PortalApp'));

function useHashRoute() {
  const read = () => (location.hash.startsWith('#/portal') ? location.hash.slice('#/portal'.length) || '/' : null);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      const next = read();
      setRoute((prev) => {
        // Coming back from the portal to the public site: start at the top.
        if (prev !== null && next === null) requestAnimationFrame(() => window.scrollTo({ top: 0 }));
        return next;
      });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const [journeyOpen, setJourneyOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const openJourney = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    setJourneyOpen(true);
  }, []);

  const closeJourney = useCallback(() => setJourneyOpen(false), []);

  // The site stays mounted underneath (so scroll position, videos and reveals survive);
  // it is just made inert and the page scroll is locked while the journey is open.
  useEffect(() => {
    document.body.classList.toggle('journey-lock', journeyOpen);
    if (!journeyOpen) opener.current?.focus({ preventScroll: true });
  }, [journeyOpen]);

  if (route !== null) {
    return (
      <Suspense fallback={<div className="portal-loading">Loading…</div>}>
        <PortalApp route={route} />
      </Suspense>
    );
  }

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <CursorGlow />
      <Botanicals />

      <div className="site" inert={journeyOpen} aria-hidden={journeyOpen || undefined}>
        <Nav onApply={openJourney} />
        <main id="main">
          <Hero onApply={openJourney} />
          <Mission />
          <HowItWorks />
          <WhoWeSupport />
          <Family />
          <ApplyBand onApply={openJourney} />
        </main>
        <Footer />
      </div>

      {journeyOpen && <Journey onClose={closeJourney} />}
    </>
  );
}

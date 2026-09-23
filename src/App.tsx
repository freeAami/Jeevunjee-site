import { useCallback, useEffect, useRef, useState } from 'react';
import { Botanicals, CursorGlow } from './components/Ambient';
import { Hero } from './components/Hero';
import { Nav } from './components/Nav';
import { ApplyBand, Family, Footer, HowItWorks, Mission, WhoWeSupport } from './components/Sections';
import { Journey } from './journey/Journey';

export default function App() {
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

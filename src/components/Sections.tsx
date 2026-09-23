import { useEffect, useRef, useState } from 'react';
import { APPLY_VIDEO, COMMITTEE_URL, CONTACT_EMAIL, family, pillars, steps } from '../content';
import { useReveal } from '../hooks/useReveal';

export function Mission() {
  const rule = useReveal<HTMLSpanElement>();
  const body = useReveal<HTMLDivElement>();
  return (
    <section className="mission" aria-labelledby="belief-h">
      <span className="gold-rule" ref={rule} aria-hidden="true" />
      <div className="reveal" ref={body}>
        <div className="eyebrow" id="belief-h">01 · Our belief</div>
        <p>
          A family with the means to help someone else have a chance — not a charity soliciting pity, not a corporate
          foundation. <em>Opportunity, dignity, family, potential.</em>
        </p>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const [open, setOpen] = useState<string | null>(null);
  const head = useReveal<HTMLDivElement>();
  const list = useReveal<HTMLDivElement>();
  return (
    <section id="how" className="how" aria-labelledby="how-h">
      <div className="section-inner">
        <div className="how-grid">
          <div className="reveal" ref={head}>
            <div className="eyebrow">02 · How it works</div>
            <h2 className="section-title" id="how-h">A simple, private process.</h2>
            <p className="intro">
              Every application is read by the Scholarship Committee. Documents are kept in a private folder only the
              Committee can open — never passed around by email.
            </p>
          </div>
          <div className="steps reveal stagger" ref={list}>
            {steps.map((s) => {
              const isOpen = open === s.n;
              return (
                <button
                  key={s.n}
                  type="button"
                  className={`step depth-card${isOpen ? ' open' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : s.n)}
                >
                  <div className="step-n" aria-hidden="true">{s.n}</div>
                  <div>
                    <div className="step-title">{s.title}</div>
                    <div className="step-body">{s.body}</div>
                    <div className="expand" aria-hidden={!isOpen}>
                      <div><div className="step-detail">{s.detail}</div></div>
                    </div>
                  </div>
                  <div className="step-meta">
                    <span>{s.time}</span>
                    <span className="step-plus" aria-hidden="true">+</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function WhoWeSupport() {
  const [open, setOpen] = useState<string | null>(null);
  const head = useReveal<HTMLDivElement>();
  const grid = useReveal<HTMLDivElement>();
  return (
    <section id="who" className="who" aria-labelledby="who-h">
      <div className="reveal" ref={head}>
        <div className="eyebrow">03 · Who we support</div>
        <h2 className="section-title" id="who-h">
          Applicants with ability and determination — and without the means to see it through.
        </h2>
      </div>
      <div className="pillars reveal stagger" ref={grid}>
        {pillars.map((p) => {
          const isOpen = open === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`pillar depth-card${isOpen ? ' open' : ''}`}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : p.id)}
            >
              <div className="pillar-head">
                <div className="pillar-title">{p.title}</div>
                <span className="pillar-tag" aria-hidden="true">{isOpen ? 'Close —' : 'Examples +'}</span>
              </div>
              <p>{p.body}</p>
              <div className="expand" aria-hidden={!isOpen}>
                <div>
                  <ul>
                    {p.examples.map((ex) => <li key={ex}>{ex}</li>)}
                  </ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function Family() {
  const head = useReveal<HTMLDivElement>();
  const grid = useReveal<HTMLDivElement>();
  return (
    <section id="family" className="family" aria-labelledby="family-h">
      <div className="section-inner">
        <div className="reveal" ref={head}>
          <div className="eyebrow">04 · Our family</div>
          <div className="family-head">
            <h2 className="section-title" id="family-h">
              The Jeevunjee family started this because someone once did the same for us.
            </h2>
            <p>
              Reviewed by the Scholarship Committee — currently Altaf and Imran Jeevunjee. The brand is Jeevunjee. The people
              behind it are stewards, not figureheads.
            </p>
          </div>
        </div>
        <div className="family-grid reveal stagger" ref={grid}>
          {family.map((m) => (
            <div key={m.name} className="member depth-card on-dark">
              <div className="member-head">
                <div className="avatar" aria-hidden="true">{m.initials}</div>
                <div>
                  <div className="member-name">{m.name}</div>
                  <div className="member-role">{m.role}</div>
                </div>
              </div>
              <p>{m.bio}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Plays only while on screen, and not at all when the visitor has asked to save data. */
function ApplyVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [enabled] = useState(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return !conn?.saveData;
  });

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    if (typeof IntersectionObserver === 'undefined') {
      v.play().catch(() => {});
      return;
    }
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [enabled]);

  if (!enabled) return null;
  return <video ref={ref} src={APPLY_VIDEO} muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />;
}

export function ApplyBand({ onApply }: { onApply: () => void }) {
  const body = useReveal<HTMLDivElement>();
  return (
    <section id="apply" className="apply" aria-labelledby="apply-h">
      <div className="apply-media media-reveal">
        <ApplyVideo />
      </div>
      <div className="apply-veil" />
      <div className="reveal" ref={body}>
        <div className="eyebrow">05 · Apply for support</div>
        <h2 className="section-title" id="apply-h">Tell us who you are, and what you're trying to reach.</h2>
        <p>
          Not a form — a conversation, one question at a time. About fifteen minutes. You'll get a reference number the
          moment you finish.
        </p>
        <button type="button" onClick={onApply} className="btn btn-gold cta cta-shimmer">
          Begin your application <span className="cta-icon" aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

export function Footer() {
  const grid = useReveal<HTMLDivElement>();
  return (
    <footer className="footer">
      <div className="section-inner">
        <div className="footer-grid reveal stagger" ref={grid}>
          <div>
            <div className="footer-brand">Jeevunjee</div>
            <p>A family-led scholarship. Sri Lanka and beyond.</p>
          </div>
          <div>
            <div className="footer-h">Explore</div>
            <div className="footer-col">
              <a href="#how">How it works</a>
              <a href="#who">Who we support</a>
              <a href="#family">Our family</a>
            </div>
          </div>
          <div>
            <div className="footer-h">Trust</div>
            {/* TODO(launch): privacy + retention need real pages — see ASSESSMENT.md */}
            <div className="footer-col">
              <span>Privacy notice</span>
              <span>Data retention</span>
              {COMMITTEE_URL ? (
                <a href={COMMITTEE_URL} target="_blank" rel="noopener noreferrer">Committee access</a>
              ) : (
                <span>Committee access</span>
              )}
            </div>
          </div>
          <div>
            <div className="footer-h">Contact</div>
            <div className="footer-col">
              {CONTACT_EMAIL ? (
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              ) : (
                <span>Reply to your confirmation email</span>
              )}
              <span>Colombo, Sri Lanka</span>
            </div>
          </div>
        </div>
        <div className="footer-base">
          <span>© {new Date().getFullYear()} Jeevunjee Family Education &amp; Opportunity</span>
          <span>Reviewed by the Scholarship Committee</span>
        </div>
      </div>
    </footer>
  );
}

import { HERO_VIDEO } from '../content';
import { FadeLoopVideo } from './FadeLoopVideo';

/** One word of the masked headline reveal. `text` includes any non-breaking spaces. */
function W({ text, delay }: { text: string; delay: number }) {
  return (
    <span className="word-mask">
      <span style={{ animationDelay: `${delay}ms` }}>{text}</span>
    </span>
  );
}

const S = '\u00a0';

export function Hero({ onApply }: { onApply: () => void }) {
  return (
    <section id="top" className="hero">
      <div className="hero-media media-reveal">
        <FadeLoopVideo src={HERO_VIDEO} />
        <div className="glow" />
      </div>

      <div className="hero-content">
        <div className="eyebrow hero-eyebrow fade-rise">
          <span className="line" aria-hidden="true" />
          <span>The Jeevunjee Family Scholarship</span>
          <span className="dot" aria-hidden="true" />
        </div>

        <h1 className="fade-rise-d1" aria-label="Education should not be limited by what a family can afford.">
          <span aria-hidden="true">
            <W text={`Education${S}`} delay={300} />
            <W text={`should${S}`} delay={380} />
            <W text={`not${S}`} delay={460} />
            <W text={`be${S}`} delay={540} />
            <W text="limited" delay={620} />
            <br />
            <W text={`by${S}`} delay={720} />
            <em>
              <W text={`what${S}`} delay={800} />
              <W text={`a${S}`} delay={880} />
              <W text="family" delay={960} />
            </em>
            <W text={`${S}can${S}`} delay={1060} />
            <W text="afford." delay={1140} />
          </span>
        </h1>

        <p className="hero-lede fade-rise-d2">
          A family-led scholarship for Sri Lankan students and other applicants with the ability and determination to pursue
          their education — but not the means. Apply directly. Be read carefully.
        </p>

        <div className="hero-ctas fade-rise-d3">
          <button type="button" onClick={onApply} className="btn btn-dark cta cta-shimmer">
            Apply for Support <span className="cta-icon" aria-hidden="true">→</span>
          </button>
          <a href="#how" className="btn-text cta">
            How it works <span className="cta-icon" aria-hidden="true" style={{ fontSize: 16 }}>→</span>
          </a>
        </div>

        <div className="hero-scroll fade-rise-d4" aria-hidden="true">
          <span>Scroll</span>
          <span className="scroll-ribbon" />
        </div>
      </div>
    </section>
  );
}

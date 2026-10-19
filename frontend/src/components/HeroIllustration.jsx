/** Decorative blood-bag illustration (pure SVG, no data). */
export default function HeroIllustration() {
  return (
    <svg className="hero-svg" viewBox="0 0 440 420" aria-hidden="true" focusable="false">
      <circle cx="220" cy="210" r="176" fill="var(--blush)" />
      <circle cx="220" cy="210" r="176" fill="none" stroke="var(--crimson-soft)" strokeWidth="2" strokeDasharray="3 10" strokeLinecap="round" />

      {/* IV stand hook */}
      <path d="M220 24v34" stroke="#2b2b2f" strokeWidth="4" strokeLinecap="round" />
      <circle cx="220" cy="22" r="6" fill="#2b2b2f" />

      {/* blood bag */}
      <path d="M150 62h140a12 12 0 0 1 12 12v156a62 62 0 0 1-62 62h-40a62 62 0 0 1-62-62V74a12 12 0 0 1 12-12Z"
        fill="#fff" stroke="#2b2b2f" strokeWidth="4" strokeLinejoin="round" />
      <path d="M138 168h164v62a62 62 0 0 1-62 62h-40a62 62 0 0 1-62-62Z" fill="var(--crimson)" />
      <path d="M138 168c28-10 40 10 82 0s54-10 82 0" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="3" />
      <rect x="178" y="92" width="84" height="52" rx="10" fill="#fff" stroke="var(--crimson-soft)" strokeWidth="3" />
      <path d="M220 104v28M206 118h28" stroke="var(--crimson)" strokeWidth="6" strokeLinecap="round" />

      {/* tube and drop */}
      <path d="M220 292v26c0 22 18 30 36 36" fill="none" stroke="#2b2b2f" strokeWidth="4" strokeLinecap="round" />
      <path d="M270 340c0 0-14 15-14 24a14 14 0 0 0 28 0c0-9-14-24-14-24Z" fill="var(--crimson)" />

      {/* pulse badge */}
      <g transform="translate(332 96)">
        <circle r="38" fill="#fff" stroke="var(--crimson-soft)" strokeWidth="3" />
        <path d="M-22 4h12l6-14 10 28 7-14h13" fill="none" stroke="var(--crimson)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* small marks */}
      <g stroke="var(--crimson)" strokeWidth="3" strokeLinecap="round" opacity=".7">
        <path d="M92 150v16M84 158h16" />
        <path d="M356 282v12M350 288h12" />
      </g>
      <circle cx="108" cy="290" r="7" fill="var(--crimson-soft)" />
      <circle cx="372" cy="196" r="5" fill="var(--crimson-soft)" />
    </svg>
  );
}

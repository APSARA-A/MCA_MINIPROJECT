import Logo from "./Logo";

function LinkMotif() {
  // Two drops joined by a chain: the "link" in LifeLink.
  return (
    <svg className="motif" viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <g fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M96 40C96 40 38 104 38 140a58 58 0 0 0 116 0C154 104 96 40 96 40Z" />
        <path d="M224 160C224 160 166 224 166 260a58 58 0 0 0 116 0C282 224 224 160 224 160Z" />
        <path d="M130 175c18 10 28 22 40 40" strokeDasharray="2 9" />
      </g>
      <g fill="rgba(255,255,255,.16)">
        <path d="M96 40C96 40 38 104 38 140a58 58 0 0 0 116 0C154 104 96 40 96 40Z" />
      </g>
    </svg>
  );
}

export default function AuthShell({ title, intro, points = [], children, wide = false }) {
  return (
    <div className="auth">
      <aside className="auth-aside">
        <Logo light />
        <div className="auth-aside-body">
          <LinkMotif />
          <h2>{title}</h2>
          <p>{intro}</p>
          {points.length > 0 && (
            <ul className="auth-points">
              {points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          )}
        </div>
      </aside>
      <section className={`auth-main${wide ? " auth-main-wide" : ""}`}>{children}</section>
    </div>
  );
}

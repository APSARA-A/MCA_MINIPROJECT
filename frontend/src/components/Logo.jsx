import { Link } from "react-router-dom";

export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path
        d="M20 3C20 3 7 17.2 7 25.2a13 13 0 0 0 26 0C33 17.2 20 3 20 3Z"
        fill="var(--crimson)"
      />
      <path
        d="M14.2 24.6h4.1l1.9-4.3 2.9 8.2 2-4h2.7"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Logo({ to = "/", light = false }) {
  return (
    <Link to={to} className={`logo${light ? " logo-light" : ""}`} aria-label="LifeLink home">
      <LogoMark />
      <span className="logo-word">LifeLink</span>
    </Link>
  );
}

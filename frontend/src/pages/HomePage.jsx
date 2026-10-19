import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import HeroPreview from "../components/HeroPreview";
import { useAuth } from "../context/AuthContext";
import { homePathFor } from "../utils/roles";

const COMBINES = [
  "Blood group compatibility",
  "Donor eligibility rules",
  "Location-based matching",
  "Donation propensity prediction",
  "Donor response tracking",
];

const TRUST = [
  "Blood group and Rh aware",
  "Nearest eligible donors first",
  "Verified hospitals only",
];

const STEPS = [
  { title: "Donor registers", text: "A donor creates a profile with blood group, contact details and location.", live: true },
  { title: "Hospital creates emergency request", text: "A verified hospital states the blood group, units and urgency needed." },
  { title: "System identifies compatible nearby donors", text: "Compatible, eligible donors are ranked by distance." },
  { title: "Selected donors are contacted", text: "Donors receive the request and reply whether they can come." },
  { title: "Hospital screens donor and records donation", text: "Staff complete a medical screening and log the donation." },
];

const FEATURES = [
  { title: "Smart Blood Group Matching", text: "Finds donors whose blood group is compatible with the patient's requirement." },
  { title: "Nearby Donor Identification", text: "Uses saved locations to bring the closest eligible donors forward." },
  { title: "ML-Based Donation Propensity", text: "Estimates historical donation propensity to help prioritise contact; availability still requires a donor response." },
  { title: "Emergency Blood Requests", text: "Lets verified hospitals raise a request with blood group, units and urgency." },
  { title: "Donor Availability Response", text: "Records whether each contacted donor is available, unavailable or silent." },
  { title: "Donation History Tracking", text: "Keeps a record of completed donations to support interval and eligibility checks." },
];

// Standard red-cell (ABO / Rh) compatibility: which donor groups a patient can receive from.
const COMPATIBILITY = [
  { patient: "O-", donors: ["O-"] },
  { patient: "O+", donors: ["O-", "O+"] },
  { patient: "A-", donors: ["O-", "A-"] },
  { patient: "A+", donors: ["O-", "O+", "A-", "A+"] },
  { patient: "B-", donors: ["O-", "B-"] },
  { patient: "B+", donors: ["O-", "O+", "B-", "B+"] },
  { patient: "AB-", donors: ["O-", "A-", "B-", "AB-"] },
  { patient: "AB+", donors: ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"] },
];

const group = (value) => value.replace("-", "\u2212");

const ICON_PATHS = [
  "M12 3s6 6.2 6 10.4a6 6 0 0 1-12 0C6 9.2 12 3 12 3Z",
  "M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  "M4 19V9M10 19V5M16 19v-7M22 19H2",
  "M12 8v4M12 16h.01M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  "M20 6 9 17l-5-5",
  "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
];

function FeatureIcon({ index }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[index]} />
    </svg>
  );
}

function CallsToAction({ user, light = false }) {
  if (user) {
    return <Link className={`btn ${light ? "btn-light" : "btn-primary"}`} to={homePathFor(user.role)}>Go to my dashboard</Link>;
  }
  return null;
}

export default function HomePage() {
  const { user } = useAuth();
  const { hash } = useLocation();

  // Hash links (/#about) arrive from other pages; scroll once the section exists.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    if (target) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [hash]);

  return (
    <>
      <div className="hero-band">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">Every Drop Connects a Life</h1>
            <p className="hero-lead">
              LifeLink connects hospitals with compatible blood donors using smart matching, location-based
              recommendations, and machine learning.
            </p>
            <div className="hero-actions">
              {user ? (
                <CallsToAction user={user} />
              ) : (
                <>
                  <Link className="btn btn-primary btn-lg" to="/register/donor">Become a Donor</Link>
                  <Link className="btn btn-secondary btn-lg" to="/register/hospital">Register Hospital</Link>
                </>
              )}
            </div>
            <ul className="hero-trust">
              {TRUST.map((item) => (
                <li key={item}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="hero-art"><HeroPreview /></div>
        </section>
      </div>

      <section id="about" className="section section-tint" aria-labelledby="about-title">
        <div className="section-inner about">
          <div>
            <h2 id="about-title" className="section-title">About LifeLink</h2>
            <p className="section-lead">
              LifeLink is a smart blood donor matching platform designed to help hospitals identify
              compatible and nearby donors during emergencies.
            </p>
            <p className="note-box">
              Machine learning estimates how likely a donor is to respond. It does not decide medical
              eligibility; eligibility is checked by rules and confirmed by hospital staff.
            </p>
          </div>
          <div className="card">
            <h3>The system combines</h3>
            <ul className="check-list">
              {COMBINES.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section" aria-labelledby="how-title">
        <div className="section-inner">
          <h2 id="how-title" className="section-title">How it works</h2>
          <p className="section-lead">
            Registration is available now. The later steps are being built and will be released in stages.
          </p>
          <ol className="timeline">
            {STEPS.map((step, index) => (
              <li key={step.title} className="timeline-step">
                <span className="timeline-num" aria-hidden="true">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <span className={`badge ${step.live ? "badge-ok" : "badge-muted"}`}>{step.live ? "Available" : "Planned"}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="compatibility" className="section section-tint" aria-labelledby="compat-title">
        <div className="section-inner">
          <div className="section-head">
            <h2 id="compat-title" className="section-title">Who can donate to whom</h2>
            <p className="section-lead">
              Matching starts with blood group. This is the standard red blood cell compatibility LifeLink
              checks before it ranks donors by distance.
            </p>
          </div>
          <div className="compat-wrap">
            <table className="compat-table">
              <caption>Red blood cell compatibility by patient blood group</caption>
              <thead>
                <tr>
                  <th scope="col">Patient needs</th>
                  <th scope="col">Compatible donor groups</th>
                </tr>
              </thead>
              <tbody>
                {COMPATIBILITY.map((row) => (
                  <tr key={row.patient}>
                    <th scope="row"><span className="blood-pill">{group(row.patient)}</span></th>
                    <td>
                      <span className="compat-chips">
                        {row.donors.map((donor) => <span key={donor} className="compat-chip">{group(donor)}</span>)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="compat-note">General guide only. Hospital staff confirm every match before a donation.</p>
        </div>
      </section>

      <section id="features" className="section" aria-labelledby="features-title">
        <div className="section-inner">
          <h2 id="features-title" className="section-title">Key features</h2>
          <p className="section-lead">
            These are the capabilities LifeLink is designed to provide. They are planned modules, not yet operational.
          </p>
          <ul className="feature-grid">
            {FEATURES.map((feature, index) => (
              <li key={feature.title} className="card feature-card">
                <span className="feature-icon"><FeatureIcon index={index} /></span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
                <span className="badge badge-muted">Planned</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="cta" aria-labelledby="cta-title">
        <div className="cta-inner">
          <h2 id="cta-title">Be Someone's Lifeline</h2>
          <p>Register today so you are ready when a hospital needs help.</p>
          <div className="hero-actions hero-actions-center">
            {user ? (
              <CallsToAction user={user} light />
            ) : (
              <>
                <Link className="btn btn-light btn-lg" to="/register/donor">Join as Donor</Link>
                <Link className="btn btn-outline-light btn-lg" to="/register/hospital">Register Your Hospital</Link>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

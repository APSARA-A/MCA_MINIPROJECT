import { Link } from "react-router-dom";
import Icon from "../components/Icon";

const DONOR_POINTS = ["Matched by blood group and distance", "Respond to requests from your phone", "Free for donors"];
const HOSPITAL_POINTS = ["Raise requests with blood group, units and urgency", "See compatible donors nearest first", "Verified by an administrator"];

function Points({ items }) {
  return (
    <ul className="choice-points">
      {items.map((item) => (
        <li key={item}><Icon name="check" size={16} strokeWidth={2.4} />{item}</li>
      ))}
    </ul>
  );
}

export default function RegisterChoice() {
  return (
    <div className="page choice">
      <div className="page-head page-head-center">
        <h1>Create your LifeLink account</h1>
        <p>Choose how you will use LifeLink. You can sign in with your email afterwards.</p>
      </div>

      <div className="choice-grid">
        <article className="choice-card choice-donor">
          <span className="choice-icon" aria-hidden="true"><Icon name="drop" size={30} strokeWidth={1.6} /></span>
          <h2>I want to donate blood</h2>
          <p>Register as a donor so hospitals can reach you when your blood group is needed nearby.</p>
          <Points items={DONOR_POINTS} />
          <Link to="/register/donor" className="btn btn-primary btn-block choice-cta">Register as a donor</Link>
        </article>

        <article className="choice-card choice-hospital">
          <span className="choice-icon" aria-hidden="true"><Icon name="hospital" size={30} strokeWidth={1.6} /></span>
          <h2>I represent a hospital</h2>
          <p>Register your hospital. After an administrator verifies it, you can request donors in an emergency.</p>
          <Points items={HOSPITAL_POINTS} />
          <Link to="/register/hospital" className="btn btn-secondary btn-block choice-cta">Register a hospital</Link>
        </article>
      </div>

      <p className="auth-switch">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}

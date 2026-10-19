import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button";
import Icon from "../components/Icon";
import LocationUpdater from "../components/LocationUpdater";
import ProfileGate from "../components/ProfileGate";
import { donorCompletion } from "../utils/completion";
import { GENDER_LABEL, formatDate, orNotProvided } from "../utils/format";

import { getDonorRequests } from "../services/notificationService";

function BloodStamp({ group }) {
  return (
    <div className="stamp" role="img" aria-label={`Blood group ${group}`}>
      <svg viewBox="0 0 120 144" aria-hidden="true">
        <path d="M60 6C60 6 14 58 14 90a46 46 0 0 0 92 0C106 58 60 6 60 6Z" fill="var(--crimson)" />
      </svg>
      <span>{group}</span>
    </div>
  );
}

function DashboardView({ profile }) {
  const [pendingCount, setPendingCount] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => getDonorRequests().then(data => { if (alive) setPendingCount(data.pending_count); }).catch(() => { if (alive) setPendingCount(null); });
    load(); window.addEventListener("focus", load);
    return () => { alive = false; window.removeEventListener("focus", load); };
  }, []);
  const [editingLocation, setEditingLocation] = useState(false);
  const { percent, missing } = donorCompletion(profile);
  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="dash-stack">
      <section className="welcome" aria-label="Welcome">
        <div className="welcome-copy">
          <h1>Welcome, {firstName}</h1>
          <p>This is the profile hospitals will see when they look for a donor like you.</p>
          {pendingCount !== null && (
            <p className="welcome-alert"><Icon name="bell" size={18} />{pendingCount} matched request{pendingCount === 1 ? "" : "s"} awaiting your response.</p>
          )}
          <div className="welcome-actions">
            <Link className="btn btn-light" to="/donor/requests">View Blood Requests</Link>
            <Link className="btn btn-outline-light" to="/donor/donation-history">View Donation History</Link>
          </div>
        </div>
        <BloodStamp group={profile.blood_group} />
      </section>

      <div className="stat-grid stat-grid-3">
        <section className="card stat-card" aria-labelledby="loc-title">
          <span className="stat-icon"><Icon name="pin" /></span>
          <h2 id="loc-title" className="card-label">Location</h2>
          <p>
            <span className={`badge ${profile.has_location ? "badge-ok" : "badge-warn"}`}>
              {profile.has_location ? "Location Available" : "Location Not Set"}
            </span>
          </p>
          <p className="card-note">
            {profile.has_location
              ? "Your saved location is used for nearby donor matching."
              : "Location-based matching will need it."}
          </p>
          <Button variant="secondary" className="btn-sm" aria-expanded={editingLocation} aria-controls="location-panel"
            onClick={() => setEditingLocation((v) => !v)}>
            {editingLocation ? "Close" : "Update Location"}
          </Button>
        </section>

        <section className="card stat-card" aria-labelledby="acct-title">
          <span className="stat-icon"><Icon name="shield" /></span>
          <h2 id="acct-title" className="card-label">Account status</h2>
          <p>
            <span className={`badge ${profile.is_active ? "badge-ok" : "badge-warn"}`}>
              {profile.is_active ? "Active" : "Inactive"}
            </span>
          </p>
          <p className="card-note">Member since {formatDate(profile.created_at)}</p>
        </section>

        <section className="card stat-card" aria-labelledby="comp-title">
          <span className="stat-icon"><Icon name="clipboard" /></span>
          <h2 id="comp-title" className="card-label">Profile completion</h2>
          <p className="big-number">{percent}%</p>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={percent} aria-label="Profile completion">
            <span style={{ width: `${percent}%` }} />
          </div>
          {missing.length > 0 ? (
            <p className="card-note">
              Missing: {missing.map((m) => m.label).join(", ")}. <Link to="/donor/profile">Complete profile</Link>
            </p>
          ) : (
            <p className="card-note">Every profile field is filled in.</p>
          )}
        </section>
      </div>

      {editingLocation && (
        <section id="location-panel" className="card" aria-labelledby="locpanel-title">
          <h2 id="locpanel-title">Update your location</h2>
          <LocationUpdater profile={profile} purpose="match you with blood requests near you" />
        </section>
      )}

      <div className="split">
        <section className="card" aria-labelledby="overview-title">
          <div className="card-head">
            <h2 id="overview-title">Profile overview</h2>
            <Link className="btn btn-secondary btn-sm" to="/donor/profile">Edit profile</Link>
          </div>
          <dl className="detail-list">
            <div><dt>Full name</dt><dd>{profile.full_name}</dd></div>
            <div><dt>Email</dt><dd>{profile.email}</dd></div>
            <div><dt>Phone</dt><dd>{profile.phone_number}</dd></div>
            <div><dt>WhatsApp</dt><dd>{orNotProvided(profile.whatsapp_number)}</dd></div>
            <div><dt>Gender</dt><dd>{GENDER_LABEL[profile.gender] || profile.gender}</dd></div>
            <div><dt>Date of birth</dt><dd>{formatDate(profile.date_of_birth)}</dd></div>
            <div><dt>Weight</dt><dd>{profile.weight_kg ? `${Number(profile.weight_kg)} kg` : "Not provided"}</dd></div>
            <div><dt>Address</dt><dd>{orNotProvided(profile.address)}</dd></div>
          </dl>
        </section>

        <aside className="card tips" aria-labelledby="tips-title">
          <h2 id="tips-title">Good to know</h2>
          <ul className="tip-list">
            <li><Icon name="phone" size={18} /><span>Keep your phone and WhatsApp numbers current so hospitals can reach you quickly.</span></li>
            <li><Icon name="heart" size={18} /><span>Replying to a request is voluntary. You can say you are not available.</span></li>
            <li><Icon name="shield" size={18} /><span>The hospital confirms your suitability with a medical check before any donation.</span></li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default function DonorDashboard() {
  return <ProfileGate>{(profile) => <DashboardView profile={profile} />}</ProfileGate>;
}

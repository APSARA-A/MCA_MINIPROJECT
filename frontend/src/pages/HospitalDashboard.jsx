import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert";
import Button from "../components/Button";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import LoadingSpinner from "../components/LoadingSpinner";
import LocationUpdater from "../components/LocationUpdater";
import ProfileGate from "../components/ProfileGate";
import { useProfile } from "../context/ProfileContext";
import { getSummary } from "../services/emergencyRequestService";
import { parseApiError } from "../services/errors";
import { formatDate } from "../utils/format";

import HospitalScreeningSummary from "../components/HospitalScreeningSummary";

function VerificationSteps({ verified }) {
  const steps = [
    { label: "Registered", state: "done" },
    { label: "Admin review", state: verified ? "done" : "current" },
    { label: "Verified", state: verified ? "done" : "todo" },
  ];
  return (
    <ol className="steps" aria-label="Verification progress">
      {steps.map((step) => (
        <li key={step.label} className={`step step-${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
          <span className="step-dot" aria-hidden="true" />
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function RequestSummary() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    return getSummary()
      .then(setSummary)
      .catch((err) => setError(parseApiError(err).general));
  }, []);

  useEffect(() => {
    // Real counts from the database, fetched when the dashboard opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (error) {
    return (
      <div className="dash-stack">
        <Alert tone="error">{error}</Alert>
        <div><Button variant="secondary" onClick={load}>Try again</Button></div>
      </div>
    );
  }
  if (!summary) return <LoadingSpinner label="Loading request counts" />;

  return (
    <dl className="count-row">
      <div><dt>Total requests</dt><dd>{summary.total_requests}</dd></div>
      <div><dt>Open requests</dt><dd>{summary.open_requests}</dd></div>
      <div><dt>Critical, still active</dt><dd>{summary.critical_requests}</dd></div>
    </dl>
  );
}

function DashboardView({ profile }) {
  const { status, reload } = useProfile();
  const [editingLocation, setEditingLocation] = useState(false);
  const verified = profile.is_verified;

  return (
    <div className="dash-stack">
      <PageHeader title={profile.hospital_name} banner>
        <p>Registration number {profile.registration_number}</p>
      </PageHeader>

      <section className={`verify verify-${verified ? "ok" : "pending"}`} aria-labelledby="verify-title">
        <div className="verify-top">
          <span className="verify-icon"><Icon name={verified ? "shield" : "clock"} size={22} /></span>
          <span className={`badge ${verified ? "badge-ok" : "badge-warn"}`}>
            {verified ? "Verified Hospital" : "Verification Pending"}
          </span>
          <h2 id="verify-title">{verified ? "Your hospital is verified" : "Your registration is under review"}</h2>
        </div>
        <p>
          {verified
            ? "An administrator has approved your registration. You can create emergency requests and find nearby donor candidates."
            : "An administrator must verify your registration number before your hospital can use restricted features such as emergency requests. You can sign in and keep your profile up to date while you wait."}
        </p>
        <VerificationSteps verified={verified} />
        {!verified && (
          <Button variant="secondary" onClick={reload} loading={status === "refreshing"}>Check status</Button>
        )}
      </section>

      <section className="card" aria-labelledby="req-overview-title">
        <div className="card-head">
          <h2 id="req-overview-title">Emergency requests</h2>
          <div className="row-actions">
            {verified ? (
              <>
                <Link className="btn btn-primary" to="/hospital/emergency/new">Create Emergency Request</Link>
                <Link className="btn btn-secondary" to="/hospital/emergency">View Emergency Requests</Link>
              </>
            ) : (
              <>
                <Button disabled aria-disabled="true">Create Emergency Request</Button>
                <Button variant="secondary" disabled aria-disabled="true">View Emergency Requests</Button>
              </>
            )}
          </div>
        </div>
        {verified ? (
          <RequestSummary />
        ) : (
          <p className="card-note">
            Verification pending. Emergency requests unlock once an administrator verifies your hospital.
          </p>
        )}
      </section>

      {verified && <HospitalScreeningSummary />}
      <div className="stat-grid stat-grid-3">
        <section className="card stat-card" aria-labelledby="h-loc-title">
          <span className="stat-icon"><Icon name="pin" /></span>
          <h2 id="h-loc-title" className="card-label">Location</h2>
          <p>
            <span className={`badge ${profile.has_location ? "badge-ok" : "badge-warn"}`}>
              {profile.has_location ? "Location Available" : "Location Not Set"}
            </span>
          </p>
          <p className="card-note">
            {profile.has_location ? "Used as the default location when creating emergency requests." : "Donor matching by distance will need it."}
          </p>
          <Button variant="secondary" className="btn-sm" aria-expanded={editingLocation} aria-controls="h-location-panel"
            onClick={() => setEditingLocation((v) => !v)}>
            {editingLocation ? "Close" : "Update Location"}
          </Button>
        </section>

        <section className="card stat-card" aria-labelledby="h-acct-title">
          <span className="stat-icon"><Icon name="shield" /></span>
          <h2 id="h-acct-title" className="card-label">Account status</h2>
          <p>
            <span className={`badge ${profile.is_active ? "badge-ok" : "badge-warn"}`}>
              {profile.is_active ? "Active" : "Inactive"}
            </span>
          </p>
          <p className="card-note">Registered {formatDate(profile.created_at)}</p>
        </section>

        <section className="card stat-card" aria-labelledby="h-contact-title">
          <span className="stat-icon"><Icon name="phone" /></span>
          <h2 id="h-contact-title" className="card-label">Contact</h2>
          <p className="contact-line">{profile.phone_number}</p>
          <p className="card-note">{profile.email}</p>
        </section>
      </div>

      {editingLocation && (
        <section id="h-location-panel" className="card" aria-labelledby="h-locpanel-title">
          <h2 id="h-locpanel-title">Update hospital location</h2>
          <LocationUpdater profile={profile} purpose="find donors close to your hospital" />
        </section>
      )}

      <div className="split">
      <section className="card" aria-labelledby="h-details-title">
        <div className="card-head">
          <h2 id="h-details-title">Hospital details</h2>
          <Link className="btn btn-secondary btn-sm" to="/hospital/profile">Edit profile</Link>
        </div>
        <dl className="detail-list">
          <div><dt>Hospital name</dt><dd>{profile.hospital_name}</dd></div>
          <div><dt>Registration number</dt><dd>{profile.registration_number}</dd></div>
          <div><dt>Email</dt><dd>{profile.email}</dd></div>
          <div><dt>Phone</dt><dd>{profile.phone_number}</dd></div>
          <div><dt>Address</dt><dd>{profile.address}</dd></div>
        </dl>
      </section>

      <section className="card card-quiet">
        <span className="stat-icon"><Icon name="link" /></span>
        <h2>Donor matches</h2>
        {verified ? <Link className="btn btn-secondary" to="/hospital/emergency">Donor Matches</Link> : <p>Donor matching unlocks after hospital verification.</p>}
        <p className="card-note">Choose an active emergency request to find compatible nearby donors.</p>
      </section>
      </div>
    </div>
  );
}

export default function HospitalDashboard() {
  return <ProfileGate>{(profile) => <DashboardView profile={profile} />}</ProfileGate>;
}

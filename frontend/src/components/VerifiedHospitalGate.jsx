import { Link } from "react-router-dom";
import { useProfile } from "../context/ProfileContext";
import Icon from "./Icon";
import ProfileGate from "./ProfileGate";

/**
 * Frontend courtesy only: unverified hospitals see an explanation instead of
 * pages whose API calls the server would reject with 403 anyway.
 */
export default function VerifiedHospitalGate({ children }) {
  const { reload } = useProfile();
  return (
    <ProfileGate>
      {(profile) =>
        profile.is_verified ? (
          children(profile)
        ) : (
          <div className="card card-notice dash-stack">
            <span className="notice-icon notice-icon-sm" aria-hidden="true"><Icon name="lock" size={26} /></span>
            <span className="badge badge-warn">Verification Pending</span>
            <h1 className="h2">Emergency requests are locked</h1>
            <p>
              An administrator must verify your hospital before you can create or manage emergency requests.
              Your profile and verification status are still available.
            </p>
            <div className="form-actions">
              <Link className="btn btn-primary" to="/hospital/dashboard">Back to dashboard</Link>
              <button type="button" className="btn btn-secondary" onClick={reload}>Check status</button>
            </div>
          </div>
        )
      }
    </ProfileGate>
  );
}

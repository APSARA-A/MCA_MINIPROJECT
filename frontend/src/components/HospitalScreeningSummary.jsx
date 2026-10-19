import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "./Alert";
import { getScreeningSummary } from "../services/screeningService";
import { notificationError } from "../utils/matchStatus";
export default function HospitalScreeningSummary() {
  const [data, setData] = useState(null), [error, setError] = useState("");
  useEffect(() => { let alive = true; const load = () => getScreeningSummary().then(fresh => { if (alive) { setData(fresh); setError(""); } }).catch(err => { if (alive) setError(notificationError(err)); }); load(); window.addEventListener("focus",load); return () => { alive=false; window.removeEventListener("focus",load); }; }, []);
  return <section className="card dash-stack"><h2>Screening and Donations</h2><Alert tone="error">{error}</Alert>
    {data && <dl className="count-row"><div><dt>Screening pending</dt><dd>{data.screening_pending}</dd></div><div><dt>Approved donors</dt><dd>{data.approved_donors}</dd></div><div><dt>Completed donations</dt><dd>{data.completed_donations}</dd></div></dl>}
    <p className="card-note">Pending and approved counts cover active requests at their current stage. Completed donations count all hospital COMPLETED records.</p>
    <div className="form-actions"><Link className="btn btn-secondary" to="/hospital/screening">Review Screening</Link><Link className="btn btn-secondary" to="/hospital/donation-history">Donation History</Link></div>
  </section>;
}

import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { Link } from "react-router-dom";
import VerifiedHospitalGate from "../components/VerifiedHospitalGate";
import Alert from "../components/Alert";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import { getScreeningQueue } from "../services/screeningService";
import { notificationError, matchLabel } from "../utils/matchStatus";
function QueueView() {
  const [data, setData] = useState(null), [error, setError] = useState(""), [page, setPage] = useState(1), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  useEffect(() => { let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setData(null);
    getScreeningQueue(page).then(value => { if (alive) { setData(value); setError(""); } }).catch(err => { if (alive) setError(notificationError(err)); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [page, refresh]);
  return <div className="dash-stack"><PageHeader title="Screening and Donations"><p>Donors who are arriving, being screened or have donated.</p></PageHeader><Alert tone="error">{error}</Alert>{loading && <LoadingSpinner label="Loading screening queue" />}<Button variant="secondary" disabled={loading} onClick={() => setRefresh(value => value+1)}>Refresh Queue</Button>
    {data && (data.results.length ? <div className="match-grid">{data.results.map(row => <article className="card match-card queue-card" key={row.match_id}><div className="card-title-row"><span className="avatar" data-initial={(row.donor_name || "?").charAt(0).toUpperCase()} aria-hidden="true" /><h2>{row.donor_name}</h2></div><p>LL-{row.request_id} · {row.blood_group} · {row.request_status}</p><p>{matchLabel(row.match_status)}</p><Link className="btn btn-secondary" to={`/hospital/matches/${row.match_id}/${['APPROVED','DONATED'].includes(row.match_status) ? 'donation' : 'screening'}`}>View Match Workflow</Link></article>)}</div> : <p className="card">No donors awaiting screening or recorded donation workflows.</p>)}
    {data && <div className="form-actions"><Button disabled={!data.previous} variant="secondary" onClick={() => setPage(value => value-1)}>Previous</Button><span>Page {page}</span><Button disabled={!data.next} variant="secondary" onClick={() => setPage(value => value+1)}>Next</Button></div>}
  </div>;
}
export default function HospitalScreeningQueue() { return <VerifiedHospitalGate>{() => <QueueView />}</VerifiedHospitalGate>; }

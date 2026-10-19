import { useEffect, useRef, useState } from "react";
import BloodDrop from "../components/BloodDrop";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import Alert from "../components/Alert";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import ProfileGate from "../components/ProfileGate";
import { getDonorRequests, respondToMatch } from "../services/notificationService";
import { matchLabel, notificationError } from "../utils/matchStatus";
import { formatDate } from "../utils/format";

function RequestCard({ row, historical, onRespond, pending }) {
  return <article className="card match-card request-card" data-urgency={row.urgency}>
    <div className="card-head"><div className="card-title-row"><BloodDrop group={row.required_blood_group} /><h3>{row.hospital_name}</h3></div><span className="badge badge-soft">{row.required_blood_group}</span></div>
    <dl className="detail-list">
      <div><dt>Request reference</dt><dd>LL-{row.request_id}</dd></div>
      <div><dt>Urgency</dt><dd>{row.urgency}</dd></div>
      <div><dt>Request date</dt><dd>{formatDate(row.request_created_at || row.created_at)}</dd></div>
      <div><dt>Request status</dt><dd>{row.request_status}</dd></div>
      <div><dt>Match status</dt><dd>{matchLabel(row.match_status)}</dd></div>
      <div><dt>Your response</dt><dd>{row.donor_response === "NOT_AVAILABLE" ? "Not Available" : row.donor_response === "AVAILABLE" ? "Available" : row.donor_response === "NO_RESPONSE" ? "No Response" : "Awaiting Response"}</dd></div>
    </dl>
    {!historical && row.can_respond ? <div className="form-actions">
      <Button disabled={pending || row.donor_response === "AVAILABLE"} onClick={() => onRespond(row.match_id, "AVAILABLE")}>I'm Available</Button>
      <Button variant="secondary" disabled={pending || row.donor_response === "NOT_AVAILABLE"} onClick={() => onRespond(row.match_id, "NOT_AVAILABLE")}>Not Available</Button>
    </div> : <p className="card-note">Availability responses are closed for this request or workflow stage.</p>}
  </article>;
}
function RequestsView() {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [pending, setPending] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const busy = useRef(false), alive = useRef(false), sequence = useRef(0);
  const reload = useRef(() => {});
  useEffect(() => {
    alive.current = true;
    async function load() {
      const token = ++sequence.current;
      try { const result = await getDonorRequests(); if (alive.current && token === sequence.current) { setData(result); setError(""); } }
      catch (err) { if (alive.current && token === sequence.current) setError(notificationError(err)); }
      finally { if (alive.current && token === sequence.current) setLoading(false); }
    }
    reload.current = load; load();
    const refresh = () => { if (!busy.current && document.visibilityState !== "hidden") load(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    // Sequence changes deliberately invalidate requests still in flight on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { alive.current = false; sequence.current++; window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, []);
  async function respond(id, response) {
    if (busy.current) return;
    busy.current = true; sequence.current++; setPending(true); setError(""); setNotice("");
    try {
      const updated = await respondToMatch(id, response);
      if (!alive.current) return;
      setData(current => ({ ...current, active_requests: current.active_requests.map(row => row.match_id === id ? { ...row, ...updated } : row) }));
      setNotice("Your availability response has been saved.");
      await reload.current();
    } catch (err) {
      if (alive.current) setError(notificationError(err));
      if (err?.response?.status === 409) {
        try { const latest = await getDonorRequests(); if (alive.current) setData(latest); } catch { /* Preserve the action error for retry. */ }
      }
    }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }
  return <div className="dash-stack">
    <PageHeader title="Blood Requests"><p>Requests matched to your donor account.</p></PageHeader>
    <p className="card card-callout"><Icon name="info" size={20} />Your availability response does not confirm medical eligibility. Final screening will be performed by the hospital.</p>
    <Alert tone="error">{error}</Alert><Alert>{notice}</Alert>
    {loading && <LoadingSpinner label="Loading blood requests" />}
    <Button variant="secondary" disabled={loading || pending} onClick={() => reload.current()}>Refresh Requests</Button>
    {data && <>
      <section className="dash-stack"><h2>Active Requests ({data.active_requests.length})</h2>
        {data.active_requests.length ? <div className="match-grid">{data.active_requests.map(row => <RequestCard key={row.match_id} row={row} pending={pending} onRespond={respond} />)}</div> : <p className="card">No active matched blood requests.</p>}
      </section>
      {data.historical_requests.length > 0 && <section className="dash-stack"><h2>Historical Requests</h2><div className="match-grid">{data.historical_requests.map(row => <RequestCard key={row.match_id} row={row} historical />)}</div></section>}
    </>}
  </div>;
}
export default function DonorBloodRequests() { return <ProfileGate>{() => <RequestsView />}</ProfileGate>; }

import { useCallback, useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { Link, useSearchParams } from "react-router-dom";
import Alert from "../components/Alert";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import LoadingSpinner from "../components/LoadingSpinner";
import { StatusBadge, UrgencyBadge } from "../components/StatusBadge";
import VerifiedHospitalGate from "../components/VerifiedHospitalGate";
import { cancelRequest, listRequests } from "../services/emergencyRequestService";
import { parseApiError } from "../services/errors";
import { STATUS_FILTERS, URGENCY_OPTIONS, formatDateTime } from "../utils/emergency";

const PAGE_SIZE = 10;

function ListView() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const urgency = params.get("urgency") || "";
  const page = Number(params.get("page")) || 1;

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [target, setTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError("");
    listRequests({ status, urgency, page })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(parseApiError(err).general));
    return () => {
      cancelled = true;
    };
  }, [status, urgency, page, reloadKey]);

  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page"); // a new filter starts from page 1
      setParams(next);
      setData(null);
    },
    [params, setParams]
  );

  function goToPage(number) {
    const next = new URLSearchParams(params);
    next.set("page", String(number));
    setParams(next);
    setData(null);
  }

  async function confirmCancel() {
    setCancelling(true);
    try {
      await cancelRequest(target.request_id);
      setNotice(`Request #${target.request_id} was cancelled.`);
      setTarget(null);
      setData(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(parseApiError(err).general);
      setTarget(null);
    } finally {
      setCancelling(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;
  const filtered = Boolean(status || urgency);

  return (
    <div className="dash-stack">
      <PageHeader title="Emergency requests"
        actions={<Link className="btn btn-primary" to="/hospital/emergency/new">Create Request</Link>}>
        <p>Your hospital's blood requests, newest first.</p>
      </PageHeader>

      {notice && <Alert tone="success">{notice}</Alert>}
      <Alert tone="error">{error}</Alert>

      <section className="card" aria-label="Filters">
        <div className="chip-row" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value || "all"} type="button" className={`chip${status === f.value ? " is-active" : ""}`}
              aria-pressed={status === f.value} onClick={() => setFilter("status", f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <label htmlFor="urgency-filter">Urgency</label>
          <select id="urgency-filter" className="control control-inline" value={urgency} onChange={(e) => setFilter("urgency", e.target.value)}>
            <option value="">All urgencies</option>
            {URGENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </section>

      {!data && !error && <LoadingSpinner label="Loading requests" />}

      {data && data.results.length === 0 && (
        <section className="card card-quiet empty-state">
          <h2>{filtered ? "No requests match these filters" : "No emergency requests yet"}</h2>
          <p>{filtered ? "Try a different status or urgency." : "Requests you create will appear here."}</p>
          {!filtered && <Link className="btn btn-primary" to="/hospital/emergency/new">Create your first request</Link>}
        </section>
      )}

      {data && data.results.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="req-table">
              <thead>
                <tr>
                  <th scope="col">Request ID</th><th scope="col">Blood group</th><th scope="col">Units</th>
                  <th scope="col">Urgency</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.request_id} data-urgency={r.urgency}>
                    <td data-label="Request ID">#{r.request_id}</td>
                    <td data-label="Blood group"><strong className="blood-pill">{r.required_blood_group}</strong></td>
                    <td data-label="Units">{r.units_required}</td>
                    <td data-label="Urgency"><UrgencyBadge urgency={r.urgency} /></td>
                    <td data-label="Status"><StatusBadge status={r.status} /></td>
                    <td data-label="Created">{formatDateTime(r.created_at)}</td>
                    <td data-label="Actions" className="row-actions">
                      <Link className="btn btn-secondary btn-sm" to={`/hospital/emergency/${r.request_id}`}>View</Link>
                      {r.is_editable && <Link className="btn btn-secondary btn-sm" to={`/hospital/emergency/${r.request_id}/edit`}>Edit</Link>}
                      {r.is_cancellable && <Button variant="danger-outline" className="btn-sm" onClick={() => setTarget(r)}>Cancel</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="pager" aria-label="Pagination">
              <Button variant="secondary" className="btn-sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>Previous</Button>
              <span>Page {page} of {totalPages}</span>
              <Button variant="secondary" className="btn-sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>Next</Button>
            </nav>
          )}
        </>
      )}

      {target && (
        <ConfirmDialog title={`Cancel request #${target.request_id}?`} confirmLabel="Cancel request" cancelLabel="Keep request"
          busy={cancelling} onConfirm={confirmCancel} onCancel={() => setTarget(null)}>
          <p>
            This {target.required_blood_group} request will be marked as cancelled and donors will no longer be
            sought for it. The record is kept, but this cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function EmergencyRequestList() {
  return <VerifiedHospitalGate>{() => <ListView />}</VerifiedHospitalGate>;
}

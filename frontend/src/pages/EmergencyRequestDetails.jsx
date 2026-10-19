import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { Link, useLocation, useParams } from "react-router-dom";
import Alert from "../components/Alert";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import LoadingSpinner from "../components/LoadingSpinner";
import { StatusBadge, UrgencyBadge } from "../components/StatusBadge";
import VerifiedHospitalGate from "../components/VerifiedHospitalGate";
import { cancelRequest, getRequest } from "../services/emergencyRequestService";
import { parseApiError } from "../services/errors";
import { formatDateTime } from "../utils/emergency";
import { formatCoordinate } from "../utils/geo";
import { orNotProvided } from "../utils/format";

import RequestDonationProgress from "../components/RequestDonationProgress";

function DetailsView() {
  const { id } = useParams();
  const location = useLocation();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [notice, setNotice] = useState(location.state?.notice || "");
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRequest(id)
      .then((result) => !cancelled && setRequest(result))
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 404) setNotFound(true);
        else setError(parseApiError(err).general);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function confirmCancel() {
    setCancelling(true);
    try {
      setRequest(await cancelRequest(id));
      setNotice("Request cancelled.");
      setError("");
    } catch (err) {
      setError(parseApiError(err).general);
    } finally {
      setCancelling(false);
      setConfirming(false);
    }
  }

  if (notFound) {
    return (
      <div className="card card-notice dash-stack">
        <h1 className="h2">Request not found</h1>
        <p>This request does not exist or is not one of your hospital's requests.</p>
        <div><Link className="btn btn-primary" to="/hospital/emergency">Back to Requests</Link></div>
      </div>
    );
  }
  if (!request) {
    return error ? <Alert tone="error">{error}</Alert> : <LoadingSpinner fullPage label="Loading request" />;
  }

  return (
    <div className="dash-stack">
      <PageHeader title={`Request #${request.request_id}`} banner
        actions={<>
          {request.is_editable && <Link className="btn btn-secondary" to={`/hospital/emergency/${request.request_id}/edit`}>Edit</Link>}
          {request.is_cancellable && <Button variant="danger-outline" onClick={() => setConfirming(true)}>Cancel Request</Button>}
          <Link className="btn btn-ghost" to="/hospital/emergency">Back to Requests</Link>
        </>}>
        <p className="badge-line"><StatusBadge status={request.status} /> <UrgencyBadge urgency={request.urgency} /></p>
      </PageHeader>

      {notice && <Alert tone="success">{notice}</Alert>}
      <Alert tone="error">{error}</Alert>

      <div className="split split-wide">
      <section className="card" aria-labelledby="req-details">
        <h2 id="req-details">Request details</h2>
        <dl className="detail-list">
          <div><dt>Request ID</dt><dd>#{request.request_id}</dd></div>
          <div><dt>Required blood group</dt><dd>{request.required_blood_group}</dd></div>
          <div><dt>Units required</dt><dd>{request.units_required}</dd></div>
          <div><dt>Urgency</dt><dd><UrgencyBadge urgency={request.urgency} /></dd></div>
          <div><dt>Status</dt><dd><StatusBadge status={request.status} /></dd></div>
          <div><dt>Hospital</dt><dd>{request.hospital_name}</dd></div>
          <div><dt>Patient reference</dt><dd>{orNotProvided(request.patient_reference)}</dd></div>
          <div><dt>Request location</dt><dd>{formatCoordinate(request.latitude)}, {formatCoordinate(request.longitude)}</dd></div>
          <div><dt>Created</dt><dd>{formatDateTime(request.created_at)}</dd></div>
          <div><dt>Last updated</dt><dd>{formatDateTime(request.updated_at)}</dd></div>
        </dl>
        {!request.is_editable && request.status !== "CANCELLED" && (
          <p className="card-note">Only open requests can be edited.</p>
        )}
      </section>

      <div className="dash-stack">
      <RequestDonationProgress requestId={request.request_id} onFulfilled={progress => setRequest(current => ({ ...current, status: progress.request_status, is_cancellable: false, is_editable: false }))} />
      <section className="card card-quiet">
        <h2>Donor matching</h2>
        {["OPEN", "MATCHING", "DONORS_CONTACTED"].includes(request.status) ? (
          <Link className="btn btn-primary" to={`/hospital/emergency/${request.request_id}/matches`}>{request.status === "DONORS_CONTACTED" ? "View Donor Matches" : "Find Matching Donors"}</Link>
        ) : <p>This request is no longer active.</p>}
        <p className="card-note">Recommendations require hospital screening and voluntary donor participation.</p>
      </section>
      </div>
      </div>

      {confirming && (
        <ConfirmDialog title={`Cancel request #${request.request_id}?`} confirmLabel="Cancel request" cancelLabel="Keep request"
          busy={cancelling} onConfirm={confirmCancel} onCancel={() => setConfirming(false)}>
          <p>The request will be marked as cancelled and donors will no longer be sought for it. The record is kept, but this cannot be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function EmergencyRequestDetails() {
  return <VerifiedHospitalGate>{() => <DetailsView />}</VerifiedHospitalGate>;
}

import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import { Link, useNavigate, useParams } from "react-router-dom";
import Alert from "../components/Alert";
import EmergencyRequestForm from "../components/EmergencyRequestForm";
import LoadingSpinner from "../components/LoadingSpinner";
import VerifiedHospitalGate from "../components/VerifiedHospitalGate";
import { getRequest, updateRequest } from "../services/emergencyRequestService";
import { parseApiError } from "../services/errors";

function EditView({ hospital }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

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

  if (notFound) {
    return (
      <div className="card card-notice dash-stack">
        <h1 className="h2">Request not found</h1>
        <p>This request does not exist or is not one of your hospital's requests.</p>
        <div><Link className="btn btn-primary" to="/hospital/emergency">Back to Requests</Link></div>
      </div>
    );
  }
  if (!request) return error ? <Alert tone="error">{error}</Alert> : <LoadingSpinner fullPage label="Loading request" />;

  if (!request.is_editable) {
    return (
      <div className="card card-notice dash-stack">
        <h1 className="h2">This request can't be edited</h1>
        <p>Only open requests can be edited. This one is {request.status_display.toLowerCase()}.</p>
        <div><Link className="btn btn-primary" to={`/hospital/emergency/${request.request_id}`}>Back to request</Link></div>
      </div>
    );
  }

  async function handleSubmit(payload) {
    await updateRequest(request.request_id, payload);
    navigate(`/hospital/emergency/${request.request_id}`, { replace: true, state: { notice: "Request updated." } });
  }

  return (
    <div className="dash-stack">
      <PageHeader title={`Edit request #${request.request_id}`}>
        <p>You can change these details while the request is still open.</p>
      </PageHeader>
      <div className="split split-form">
      <section className="card">
        <EmergencyRequestForm
          hospital={hospital}
          initialValues={{
            patient_reference: request.patient_reference || "",
            required_blood_group: request.required_blood_group,
            units_required: String(request.units_required),
            urgency: request.urgency,
          }}
          initialLocation={{ latitude: request.latitude, longitude: request.longitude, source: "request" }}
          submitLabel="Save changes"
          cancelTo={`/hospital/emergency/${request.request_id}`}
          onSubmit={handleSubmit}
        />
      </section>
        <aside className="card tips" aria-labelledby="guide-title">
          <h2 id="guide-title">Before you submit</h2>
          <ul className="tip-list">
            <li><Icon name="clipboard" size={18} /><span>Share only what staff and donors need: blood group, units and urgency.</span></li>
            <li><Icon name="clock" size={18} /><span>Choose the urgency that matches the clinical situation.</span></li>
            <li><Icon name="pin" size={18} /><span>Confirm the location donors should travel to.</span></li>
            <li><Icon name="link" size={18} /><span>After submitting, review compatible donors from the request page.</span></li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default function EditEmergencyRequest() {
  return <VerifiedHospitalGate>{(hospital) => <EditView hospital={hospital} />}</VerifiedHospitalGate>;
}

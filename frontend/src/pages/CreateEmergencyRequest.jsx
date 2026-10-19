import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import EmergencyRequestForm from "../components/EmergencyRequestForm";
import VerifiedHospitalGate from "../components/VerifiedHospitalGate";
import { createRequest } from "../services/emergencyRequestService";

function CreateView({ hospital }) {
  const navigate = useNavigate();
  // Prefill with the hospital's registered coordinates when they exist; never a default.
  const initialLocation = hospital.has_location
    ? { latitude: hospital.latitude, longitude: hospital.longitude, source: "hospital" }
    : null;

  async function handleSubmit(payload) {
    const created = await createRequest(payload);
    navigate(`/hospital/emergency/${created.request_id}`, { replace: true, state: { notice: "Emergency request submitted." } });
  }

  return (
    <div className="dash-stack">
      <PageHeader title="Create emergency request">
        <p>Tell LifeLink which blood group you need and where. Review nearby donors after submitting the request.</p>
      </PageHeader>
      <div className="split split-form">
      <section className="card">
        <EmergencyRequestForm hospital={hospital} initialLocation={initialLocation} submitLabel="Submit Emergency Request"
          cancelTo="/hospital/emergency" onSubmit={handleSubmit} />
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

export default function CreateEmergencyRequest() {
  return <VerifiedHospitalGate>{(hospital) => <CreateView hospital={hospital} />}</VerifiedHospitalGate>;
}

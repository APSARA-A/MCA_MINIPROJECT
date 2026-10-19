import { useState } from "react";
import PageHeader from "../components/PageHeader";
import { Link, useParams } from "react-router-dom";
import VerifiedHospitalGate from "../components/VerifiedHospitalGate";
import MatchWorkflowDetails from "../components/MatchWorkflowDetails";
import ConfirmDialog from "../components/ConfirmDialog";
import Alert from "../components/Alert";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import useMatchWorkflow from "../hooks/useMatchWorkflow";
import {
  markArrived,
  startScreening,
  recordDecision,
} from "../services/screeningService";

const initial = {
  hemoglobin: "",
  blood_pressure: "",
  pulse: "",
  temperature: "",
  weight: "",
  medical_notes: "",
  screened_by: "",
  screening_status: "",
  rejection_reason: "",
};

const numeric = [
  ["hemoglobin", "Hemoglobin (g/dL)", 1, 25, 0.1],
  ["pulse", "Pulse (bpm)", 20, 250, 1],
  ["temperature", "Temperature (°C)", 30, 45, 0.1],
  ["weight", "Weight (kg)", 0.01, 500, 0.01],
];

function ScreeningView() {
  const { matchId } = useParams();
  const {
    data,
    error,
    notice,
    loading,
    pending,
    reload,
    run,
  } = useMatchWorkflow(matchId);

  const [form, setForm] = useState(initial);
  const [validation, setValidation] = useState("");
  const [dialog, setDialog] = useState("");

  function change(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  function submit(event) {
    event.preventDefault();
    setValidation("");

    if (
      !form.screened_by.trim()
      || !form.screening_status
      || (
        form.screening_status === "REJECTED"
        && !form.rejection_reason.trim()
      )
    ) {
      setValidation(
        "Choose a decision, enter the staff name and provide a reason for rejection."
      );
      return;
    }

    if (
      form.blood_pressure
      && !/^[0-9]{2,3}\/[0-9]{2,3}$/.test(form.blood_pressure)
    ) {
      setValidation(
        "Enter blood pressure as systolic/diastolic, for example 120/80."
      );
      return;
    }

    setDialog("decision");
  }

  async function act() {
    const payload = {
      screening_status: form.screening_status,
      screened_by: form.screened_by.trim(),
      medical_notes: form.medical_notes,
      rejection_reason:
        form.screening_status === "REJECTED"
          ? form.rejection_reason.trim()
          : "",
      blood_pressure: form.blood_pressure.trim(),
    };

    numeric.forEach(([key]) => {
      if (form[key] !== "") {
        payload[key] = Number(form[key]);
      }
    });

    const ok = dialog === "arrival"
      ? await run(
          () => markArrived(matchId),
          "Donor arrival recorded."
        )
      : await run(
          () => recordDecision(matchId, payload),
          "Hospital screening decision recorded."
        );

    if (ok) setDialog("");
  }

  return (
    <div className="dash-stack">
      <PageHeader title="Medical Screening">
        <p>
          The hospital records its screening decision. ML scores and
          availability responses do not determine medical approval.
        </p>
      </PageHeader>

      {!dialog && <Alert tone="error">{error}</Alert>}
      <Alert tone="success">{notice}</Alert>

      {loading && <LoadingSpinner label="Loading screening" />}

      <Button
        variant="secondary"
        disabled={loading || pending}
        onClick={reload}
      >
        Refresh Screening
      </Button>

      {data && !loading && (
        <>
          <MatchWorkflowDetails data={data} />

          <section className="card dash-stack">
            <h2>Next step</h2>
            <p>
              {data.match_status === "AVAILABLE"
                ? "Confirm physical arrival to create a pending screening record."
                : data.match_status === "ARRIVED"
                  ? "Arrival is recorded. Click Start Screening, enter the actual examination details and record the hospital decision. Donation history is created only after physical donation confirmation."
                  : data.match_status === "SCREENING"
                    ? "Enter the actual examination details and explicitly approve or reject this donor."
                    : data.match_status === "APPROVED"
                      ? "Screening is approved. After the donor physically donates, click Complete Donation and confirm the date and units to update donation history."
                      : data.match_status === "DONATED"
                        ? "The completed donation is saved in donor and hospital donation history."
                        : "Review the recorded hospital decision. A rejected screening cannot create a completed donation."}
            </p>
          </section>

          <div className="form-actions">
            {data.actions.can_mark_arrived && (
              <Button
                disabled={pending}
                onClick={() => setDialog("arrival")}
              >
                Mark Arrived
              </Button>
            )}

            {data.actions.can_start_screening && (
              <Button
                loading={pending}
                onClick={() =>
                  run(
                    () => startScreening(matchId),
                    "Screening started. No medical approval has been recorded."
                  )
                }
              >
                Start Screening
              </Button>
            )}

            {data.actions.can_complete && (
              <Link
                className="btn btn-primary"
                to={`/hospital/matches/${matchId}/donation`}
              >
                Complete Donation
              </Link>
            )}
          </div>

          {data.actions.can_decide && (
            <form className="card dash-stack" onSubmit={submit}>
              <h2>Record Screening Decision</h2>
              <p>
                Enter measurements actually recorded. Optional blanks
                remain unrecorded; the system does not calculate approval.
              </p>

              <Alert tone="error">{validation}</Alert>

              <div className="screening-form-grid">
                {numeric.map(([name, label, min, max, step]) => (
                  <label className="field" key={name}>
                    {label}
                    <input
                      type="number"
                      name={name}
                      value={form[name]}
                      onChange={change}
                      min={min}
                      max={max}
                      step={step}
                      disabled={pending}
                    />
                  </label>
                ))}

                <label className="field">
                  Blood pressure
                  <input
                    name="blood_pressure"
                    value={form.blood_pressure}
                    onChange={change}
                    disabled={pending}
                  />
                </label>

                <label className="field">
                  Screened by
                  <input
                    name="screened_by"
                    value={form.screened_by}
                    onChange={change}
                    required
                    maxLength={100}
                    disabled={pending}
                  />
                </label>

                <div className="field">
                  <label htmlFor="screening-decision">Decision</label>
                  <select
                    id="screening-decision"
                    name="screening_status"
                    value={form.screening_status}
                    onChange={change}
                    required
                    disabled={pending}
                  >
                    <option value="">Choose hospital decision</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
              </div>

              <label className="field">
                Medical notes
                <textarea
                  name="medical_notes"
                  value={form.medical_notes}
                  onChange={change}
                  disabled={pending}
                />
              </label>

              {form.screening_status === "REJECTED" && (
                <label className="field">
                  Rejection reason
                  <textarea
                    name="rejection_reason"
                    value={form.rejection_reason}
                    onChange={change}
                    required
                    disabled={pending}
                  />
                </label>
              )}

              <Button type="submit" disabled={pending}>
                Record Screening Decision
              </Button>
            </form>
          )}

          {data.screening && !data.actions.can_decide && (
            <section className="card dash-stack">
              <h2>
                {data.screening.screening_status === "PENDING"
                  ? "Pending Screening"
                  : "Recorded Screening"}
              </h2>

              <dl className="detail-list">
                {[
                  ["screening_status", "Decision"],
                  ["screened_by", "Screened by"],
                  ["screening_date", "Screening date"],
                  ...numeric.map(([key, label]) => [key, label]),
                  ["blood_pressure", "Blood pressure"],
                  ["medical_notes", "Medical notes"],
                  ["rejection_reason", "Rejection reason"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      {data.screening[key] == null
                      || data.screening[key] === ""
                        ? "Not recorded"
                        : data.screening[key]}
                    </dd>
                  </div>
                ))}
              </dl>

              <p>
                {data.screening.screening_status === "PENDING"
                  ? "No examination results or medical approval have been recorded. Start Screening to enter the details."
                  : "Finalized decisions cannot be edited through this workflow."}
              </p>
            </section>
          )}

          <Link
            to={`/hospital/emergency/${data.request.request_id}/matches`}
          >
            Back to donor matches
          </Link>
        </>
      )}

      {dialog && (
        <ConfirmDialog
          title={
            dialog === "arrival"
              ? "Confirm donor arrival"
              : "Confirm hospital screening decision"
          }
          confirmLabel={
            dialog === "arrival"
              ? "Confirm Arrival"
              : "Confirm Screening Decision"
          }
          cancelLabel="Cancel"
          busy={pending}
          onConfirm={act}
          onCancel={() => setDialog("")}
        >
          <p>
            {dialog === "arrival"
              ? "Confirm that this donor has physically arrived at the hospital."
              : `Record the hospital decision ${form.screening_status}? Finalized decisions cannot be overwritten.`}
          </p>
          <Alert tone="error">{error}</Alert>
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function HospitalMedicalScreening() {
  const { matchId } = useParams();

  return (
    <VerifiedHospitalGate>
      {() => <ScreeningView key={matchId} />}
    </VerifiedHospitalGate>
  );
}
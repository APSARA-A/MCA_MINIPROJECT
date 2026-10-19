import { useState } from "react";
import PageHeader from "../components/PageHeader";
import { Link, useParams } from "react-router-dom";
import VerifiedHospitalGate from "../components/VerifiedHospitalGate";
import MatchWorkflowDetails from "../components/MatchWorkflowDetails";
import RequestDonationProgress from "../components/RequestDonationProgress";
import ConfirmDialog from "../components/ConfirmDialog";
import Alert from "../components/Alert";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import useMatchWorkflow from "../hooks/useMatchWorkflow";
import { completeDonation } from "../services/donationService";
import { localDate, localToday } from "../utils/donation";

function CompletionView() {
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

  const [date, setDate] = useState("");
  const [units, setUnits] = useState("");
  const [dialog, setDialog] = useState(false);
  const [validation, setValidation] = useState("");

  function submit(event) {
    event.preventDefault();
    setValidation("");

    if (
      !date
      || date > localToday()
      || !Number.isInteger(Number(units))
      || Number(units) < 1
      || Number(units) > 50
    ) {
      setValidation("Enter a valid donation date and 1–50 whole units.");
      return;
    }

    setDialog(true);
  }

  async function confirm() {
    const ok = await run(
      () =>
        completeDonation(matchId, {
          donation_date: date,
          units_donated: Number(units),
          blood_group: data.blood_group,
          confirmed_completed: true,
        }),
      "Completed donation recorded."
    );

    if (ok) setDialog(false);
  }

  return (
    <div className="dash-stack">
      <PageHeader title="Donation Completion">
        <p>
          Record only a donation that physically occurred after hospital approval.
        </p>
      </PageHeader>

      <Alert tone="error">{dialog ? "" : error}</Alert>
      <Alert tone="success">{notice}</Alert>

      {loading && <LoadingSpinner label="Loading donation match" />}

      <Button
        variant="secondary"
        disabled={pending || loading}
        onClick={reload}
      >
        Refresh Match
      </Button>

      {data && !loading && (
        <>
          <MatchWorkflowDetails data={data} />

          {data.actions.can_complete ? (
            <form className="card dash-stack" onSubmit={submit}>
              <h2>Confirm Donation Completed</h2>
              <Alert tone="error">{validation}</Alert>

              <label className="field">
                Donation date
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                  max={localToday()}
                  min={
                    data.screening?.screening_date
                      ? localDate(data.screening.screening_date)
                      : undefined
                  }
                  disabled={pending}
                />
              </label>

              <label className="field">
                Units donated
                <input
                  type="number"
                  value={units}
                  onChange={(event) => setUnits(event.target.value)}
                  required
                  min={1}
                  max={50}
                  step={1}
                  disabled={pending}
                />
              </label>

              <Button type="submit" disabled={pending}>
                Confirm Donation Completed
              </Button>
            </form>
          ) : (
            !data.donation && (
              <p className="card">
                Donation completion requires an active request, an AVAILABLE
                donor response and APPROVED hospital screening.
              </p>
            )
          )}

          {data.donation && (
            <section className="card dash-stack">
              <h2>Donation Completed</h2>

              <p>
                This completed event is saved in DonationHistory and will
                be used for future ML feature extraction.
              </p>

              <Link to="/hospital/donation-history">
                View updated donation history
              </Link>

              <dl className="detail-list">
                <div>
                  <dt>Date</dt>
                  <dd>{data.donation.donation_date}</dd>
                </div>
                <div>
                  <dt>Blood group</dt>
                  <dd>{data.donation.blood_group}</dd>
                </div>
                <div>
                  <dt>Units</dt>
                  <dd>{data.donation.units_donated}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{data.donation.status}</dd>
                </div>
              </dl>
            </section>
          )}

          <RequestDonationProgress
            key={`${matchId}:${data.match_status}`}
            requestId={data.request.request_id}
            onFulfilled={reload}
          />

          <Link
            to={`/hospital/emergency/${data.request.request_id}/matches`}
          >
            Back to donor matches
          </Link>
        </>
      )}

      {dialog && (
        <ConfirmDialog
          title="Confirm physical donation"
          confirmLabel="Record Completed Donation"
          cancelLabel="Cancel"
          busy={pending}
          onConfirm={confirm}
          onCancel={() => setDialog(false)}
        >
          <p>
            Confirm that the donor has physically completed the blood donation.
            This action will create a completed donation history record.
          </p>
          <Alert tone="error">{error}</Alert>
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function HospitalDonationCompletion() {
  const { matchId } = useParams();

  return (
    <VerifiedHospitalGate>
      {() => <CompletionView key={matchId} />}
    </VerifiedHospitalGate>
  );
}
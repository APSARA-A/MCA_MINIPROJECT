import { useEffect, useState } from "react";
import Alert from "./Alert";
import Button from "./Button";
import LoadingSpinner from "./LoadingSpinner";
import {
  getDonorHistory,
  getHospitalHistory,
} from "../services/donationService";
import { notificationError } from "../utils/matchStatus";
import { formatDate } from "../utils/format";

export default function DonationHistoryList({ hospital = false }) {
  const [page, setPage] = useState(1);
  const [requestFilter, setRequestFilter] = useState("");
  const [filter, setFilter] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    setData(null);

    const load = hospital
      ? getHospitalHistory({
          page,
          ...(filter ? { request_id: filter } : {}),
        })
      : getDonorHistory(page);

    load
      .then((fresh) => {
        if (alive) setData(fresh);
      })
      .catch((err) => {
        if (alive) setError(notificationError(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [hospital, page, filter, refresh]);

  useEffect(() => {
    const update = () => {
      if (document.visibilityState !== "hidden") {
        setRefresh((value) => value + 1);
      }
    };

    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);

    const interval = window.setInterval(update, 30000);

    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="dash-stack">
      <Alert tone="error">{error}</Alert>

      {loading && <LoadingSpinner label="Loading donation history" />}

      {hospital && (
        <form
          className="form-actions"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setFilter(requestFilter);
          }}
        >
          <label className="field">
            Emergency request ID
            <input
              type="number"
              min={1}
              step={1}
              value={requestFilter}
              onChange={(event) => setRequestFilter(event.target.value)}
            />
          </label>

          <Button type="submit" disabled={loading}>
            Filter History
          </Button>
        </form>
      )}

      <Button
        variant="secondary"
        disabled={loading}
        onClick={() => setRefresh((value) => value + 1)}
      >
        Refresh History
      </Button>

      {data && !loading && (
        <>
          {!hospital && (
            <dl className="count-row">
              <div>
                <dt>Total completed donations</dt>
                <dd>{data.summary.total_completed}</dd>
              </div>
              <div>
                <dt>Total units donated</dt>
                <dd>{data.summary.total_units}</dd>
              </div>
              <div>
                <dt>Most recent donation</dt>
                <dd>
                  {data.summary.most_recent
                    ? formatDate(data.summary.most_recent)
                    : "None recorded"}
                </dd>
              </div>
            </dl>
          )}

          {data.results.length ? (
            <div className="match-grid">
              {data.results.map((row) => (
                <article
                  className="card match-card"
                  key={row.donation_id}
                >
                  <div className="card-title-row">
                    <span className="avatar" data-initial={(hospital ? row.donor_name : row.hospital_name || "?").charAt(0).toUpperCase()} aria-hidden="true" />
                    <h2>{hospital ? row.donor_name : row.hospital_name}</h2>
                  </div>

                  <dl className="detail-list">
                    {hospital && (
                      <div>
                        <dt>Hospital</dt>
                        <dd>{row.hospital_name}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Donation date</dt>
                      <dd>{formatDate(row.donation_date)}</dd>
                    </div>
                    <div>
                      <dt>Blood group</dt>
                      <dd>{row.blood_group}</dd>
                    </div>
                    <div>
                      <dt>Units donated</dt>
                      <dd>{row.units_donated}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{row.status}</dd>
                    </div>
                    <div>
                      <dt>Request</dt>
                      <dd>
                        {row.request_id
                          ? `LL-${row.request_id}`
                          : "Not linked"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="card">
              {hospital
                ? "No donation records found."
                : "No completed donations recorded yet."}
            </p>
          )}

          <div className="form-actions">
            <Button
              variant="secondary"
              disabled={!data.previous}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>

            <span>Page {page}</span>

            <Button
              variant="secondary"
              disabled={!data.next}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
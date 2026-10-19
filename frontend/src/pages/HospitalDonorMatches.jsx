import { useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import { Link, useParams } from "react-router-dom";
import Alert from "../components/Alert";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import VerifiedHospitalGate from "../components/VerifiedHospitalGate";
import { getMatches, generateMatches } from "../services/matchingService";
import { getPredictions } from "../services/mlPredictionService";
import { parseApiError } from "../services/errors";

import MatchContactActions from "../components/MatchContactActions";
import HospitalResponseSummary from "../components/HospitalResponseSummary";
import { matchLabel } from "../utils/matchStatus";

const LIVE_MATCH_FIELDS = ["donor_name", "blood_group", "distance_km", "system_eligible", "recorded_system_eligible",
  "eligible_for_contact", "prescreening_outcome", "current_issues", "reasons", "warnings", "match_status", "donor_response", "notification_status"];

function predictionLabel(row) {
  if (row.prediction_available && Number.isFinite(row.donation_probability) && row.donation_probability >= 0 && row.donation_probability <= 1) {
    return `${(row.donation_probability * 100).toFixed(1)}%`;
  }
  const messages = {
    INSUFFICIENT_DONATION_HISTORY: "Insufficient Donation History",
    INVALID_DONATION_HISTORY: "Donation History Needs Review",
    PREDICTION_FAILED: "Prediction Unavailable",
    INVALID_MODEL_OUTPUT: "Prediction Unavailable",
  };
  return messages[row.unavailable_reason] || "Model Unavailable";
}

function MatchCards({ rows, history = false, analyzed = false, ranked = false, contactActive = false, onConfirmed }) {
  const ordered = ranked ? rows : [...rows].sort((a, b) =>
    (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  return <div className="match-grid">{ordered.map((row, index) => <article className="card match-card" key={row.match_id ?? `review-${index}`}>
    <div className="card-head"><div className="card-title-row"><span className="avatar" data-initial={(row.donor_name || "?").charAt(0).toUpperCase()} aria-hidden="true" /><h3>{row.donor_name}</h3></div><span className="badge badge-soft">{row.blood_group}</span></div>
    <dl className="detail-list">
      <div><dt>Distance</dt><dd>{row.distance_km == null ? "Location needs review" : `${Number(row.distance_km).toFixed(2)} km`}</dd></div>
      <div><dt>Preliminary Eligibility</dt><dd>{history || !row.eligible_for_contact ? "Review / not currently recommended" : row.prescreening_outcome === "REVIEW_REQUIRED" ? "Contact rules passed; review required" : "Contact rules passed"}</dd></div>
      {analyzed && <div><dt>Random Forest Prediction</dt><dd>{predictionLabel(row)}</dd></div>}
      <div><dt>Screening Required</dt><dd>Yes</dd></div>
      <div><dt>Match Status</dt><dd>{row.match_status ? <><span>{row.match_status}</span> — {matchLabel(row.match_status)}</> : "Review required — no match record"}</dd></div>
    </dl>
    {row.match_id && <dl className="detail-list"><div><dt>Donor response</dt><dd>{row.donor_response ?? "Not loaded"}</dd></div><div><dt>Notification status</dt><dd>{row.notification_status ?? "Not loaded"}</dd></div></dl>}
    {contactActive && !history && row.match_id && row.eligible_for_contact && ["IDENTIFIED", "CONTACTED", "AVAILABLE"].includes(row.match_status) && <MatchContactActions match={row} onConfirmed={onConfirmed} />}
    {row.match_id && <div className="form-actions">
      {contactActive && ["AVAILABLE", "ARRIVED", "SCREENING"].includes(row.match_status) && <Link className="btn btn-secondary" to={`/hospital/matches/${row.match_id}/screening`}>{({ AVAILABLE: "Mark Arrived", ARRIVED: "Start Screening", SCREENING: "View Screening" })[row.match_status]}</Link>}
      {contactActive && row.match_status === "APPROVED" && <Link className="btn btn-primary" to={`/hospital/matches/${row.match_id}/donation`}>Complete Donation</Link>}
      {row.match_status === "REJECTED" && <span className="badge badge-warn">Screening Rejected</span>}
      {row.match_status === "DONATED" && <Link className="btn btn-secondary" to={`/hospital/matches/${row.match_id}/donation`}>Donation Completed</Link>}
    </div>}
    {[...(row.current_issues || []), ...(row.warnings || [])].length > 0 && <ul className="match-notes">{[...new Set([...(row.current_issues || []), ...(row.warnings || [])])].map(note => <li key={note}>{note}</li>)}</ul>}
  </article>)}</div>;
}

function MatchingView() {
  const { id } = useParams();
  const responseSnapshot = useRef(null);
  const [responses, setResponses] = useState(null);
  const [responseRefresh, setResponseRefresh] = useState(0);
  function onConfirmed(data) {
    setResponses(current => current ? { ...current, request_status: data.request_status, matches: current.matches.map(row => row.match_id === data.match_id ? { ...row, ...data } : row) } : null);
    setResponseRefresh(value => value + 1);
  }
  const [radius, setRadius] = useState(25);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [ranking, setRanking] = useState("NEAREST");
  const analysisOperation = useRef(0);
  const analysisBusy = useRef(false);
  const operation = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const token = ++operation.current;
    analysisOperation.current += 1;
    analysisBusy.current = false;
    // Fetch state must reset when the request or radius changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    setGenerating(false);
    busy.current = false;
    setResult(null);
    setAnalysis(null);
    setAnalysisError("");
    setAnalyzing(false);
    setRanking("NEAREST");
    getMatches(id, radius).then(data => {
      if (token === operation.current) setResult(data);
    }).catch(err => {
      if (token === operation.current) {
        const parsed = parseApiError(err);
        setError(parsed.general || Object.values(parsed.fields).join(" "));
      }
    }).finally(() => { if (token === operation.current) setLoading(false); });
    return () => { operation.current += 1; analysisOperation.current += 1; };
  }, [id, radius]);

  async function generate() {
    if (busy.current || analysisBusy.current) return;
    busy.current = true;
    const token = ++operation.current;
    analysisOperation.current += 1;
    setAnalysis(null);
    setAnalysisError("");
    setRanking("NEAREST");
    setGenerating(true);
    setError("");
    try {
      const data = await generateMatches(id, radius);
      if (token === operation.current) { setResult(data); setResponseRefresh(value => value + 1); }
    } catch (err) {
      if (token === operation.current) {
        const parsed = parseApiError(err);
        setError(parsed.general || Object.values(parsed.fields).join(" "));
      }
    } finally {
      if (token === operation.current) {
        busy.current = false;
        setGenerating(false);
      }
    }
  }
  async function analyze(mode = ranking) {
    if (busy.current || analysisBusy.current) return;
    analysisBusy.current = true;
    const token = ++analysisOperation.current;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const data = await getPredictions(id, { radius_km: radius, ranking: mode });
      if (token === analysisOperation.current) {
        setAnalysis(data);
        setRanking(mode);
      }
    } catch (err) {
      if (token === analysisOperation.current) {
        const parsed = parseApiError(err);
        setAnalysisError(parsed.general || Object.values(parsed.fields).join(" "));
      }
    } finally {
      if (token === analysisOperation.current) {
        analysisBusy.current = false;
        setAnalyzing(false);
      }
    }
  }
  const currentResponses = responses && String(responses.request_id) === String(id) ? responses : null;
  const requestStatus = currentResponses?.request_status || result?.request_status;
  function onResponsesLoaded(data) {
    setResponses(data);
    const key = `${id}:${radius}`;
    const fingerprint = JSON.stringify([data.request_status, data.matches?.map(row => [row.match_id, row.match_status, row.donor_response, row.notification_status])]);
    const previous = responseSnapshot.current;
    responseSnapshot.current = { key, fingerprint };
    if (previous?.key === key && previous.fingerprint !== fingerprint && !busy.current) {
      const token = operation.current;
      getMatches(id, radius).then(fresh => { if (token === operation.current) setResult(fresh); })
        .catch(err => { if (token === operation.current) setError(parseApiError(err).general); });
      if (analysis && !analysisBusy.current) {
        const predictionToken = analysisOperation.current;
        getPredictions(id, { radius_km: radius, ranking }).then(fresh => {
          if (token === operation.current && predictionToken === analysisOperation.current) setAnalysis(fresh);
        }).catch(err => { if (predictionToken === analysisOperation.current) setAnalysisError(parseApiError(err).general); });
      }
    }
  }
  const active = result && ["OPEN", "MATCHING"].includes(requestStatus);
  const contactActive = ["OPEN", "MATCHING", "DONORS_CONTACTED"].includes(requestStatus);
  const stored = (analysis?.predictions || [...(result?.matches || []), ...(result?.historical_matches || [])]).map(row => {
    const live = [...(result?.matches || []), ...(result?.historical_matches || [])].find(item => item.match_id === row.match_id);
    const currentRow = live ? { ...row, ...Object.fromEntries(LIVE_MATCH_FIELDS.filter(key => Object.hasOwn(live, key)).map(key => [key, live[key]])) } : row;
    const updated = currentResponses?.matches?.find(item => item.match_id === row.match_id);
    const merged = updated ? { ...currentRow, ...updated } : currentRow;
    return { ...merged, eligible_for_contact: currentRow.eligible_for_contact && contactActive && !["UNAVAILABLE", "REJECTED", "DONATED", "CANCELLED"].includes(merged.match_status) };
  });
  const current = stored.filter(row => row.eligible_for_contact);
  const unscored = analysis && ranking === "PROPENSITY" ? current.filter(row => !row.prediction_available) : [];
  const displayed = analysis && ranking === "PROPENSITY" ? current.filter(row => row.prediction_available) : current;
  const history = stored.filter(row => !row.eligible_for_contact);
  return <div className="dash-stack">
    <PageHeader title="Recommended Blood Donors" actions={<Link className="btn btn-secondary" to={`/hospital/emergency/${id}`}>Back to request</Link>}>
      <p>Request #{id}</p>
    </PageHeader>
    <Alert tone="error">{error}</Alert>
    {loading && <LoadingSpinner label="Loading donor matches" />}
    {result && <>
      <section className="card"><dl className="detail-list">
        <div><dt>Emergency request ID</dt><dd>#{result.request_id}</dd></div>
        <div><dt>Required blood group</dt><dd>{result.required_blood_group}</dd></div>
        <div><dt>Units required</dt><dd>{result.units_required}</dd></div>
        <div><dt>Urgency</dt><dd>{result.urgency}</dd></div>
        <div><dt>Request status</dt><dd>{requestStatus}</dd></div>
      </dl></section>
      <section className="card dash-stack">
        <div className="form-actions"><div className="matching-radius"><label htmlFor="matching-radius">Selected radius</label>
          <select id="matching-radius" value={radius} disabled={generating || analyzing} onChange={event => setRadius(Number(event.target.value))}>
            {[5, 10, 25, 50].map(value => <option key={value} value={value}>{value} km</option>)}
          </select></div>
          <Button loading={generating} disabled={!active || loading || analyzing} onClick={generate}>Find Nearby Donors</Button>
        </div>
        {!active && <p>Matching generation is available only for OPEN or MATCHING requests.</p>}
        <p className="card-note">Straight-line geographic distance; road distance and travel time may differ. Donor consent and availability have not been confirmed.</p>
        <p>Final donor eligibility is subject to hospital medical screening.</p>
        <p className="card-note">Preliminary red-cell ABO/RhD compatibility only. The hospital blood bank must confirm typing, crossmatching and component selection.</p>
      </section>
      <HospitalResponseSummary requestId={id} refreshKey={responseRefresh} onLoaded={onResponsesLoaded} />
      <section className="card dash-stack" aria-labelledby="ml-title">
        <h2 id="ml-title">Donation propensity</h2>
        <div className="form-actions matching-actions">
          <Button variant="secondary" loading={analyzing} disabled={generating || loading || stored.length === 0}
            onClick={() => analyze()}>Analyze Donation Propensity</Button>
          <div className="matching-radius"><label htmlFor="donor-ranking">Donor ranking</label>
            <select id="donor-ranking" value={ranking} disabled={!analysis || analyzing || generating}
              onChange={event => analyze(event.target.value)}>
              <option value="NEAREST">Nearest First</option>
              <option value="PROPENSITY">Highest Donation Propensity</option>
              <option value="COMBINED">Combined Priority</option>
            </select>
          </div>
        </div>
        <Alert tone="error">{analysisError}</Alert>
        {analysis && !analysis.model_available && <Alert tone="error">Random Forest model unavailable. Matching remains available; no replacement scores are generated.</Alert>}
        <p className="card-note">Random Forest donation propensity is an experimental prediction based on historical donation patterns. It does not confirm donor availability, consent or medical eligibility.</p>
        {ranking === "COMBINED" && <p className="card-note">Experimental priority: preliminary contact rules first, then 5 km distance bands; within each band, scored donors first and higher propensity, then distance and match ID. This heuristic is not clinically validated.</p>}
        {analysis && <p className="card-note">Based on completed donation history through {analysis.reference_date}. Donors without history remain visible.</p>}
      </section>
      <section className="dash-stack" aria-labelledby="current-matches"><h2 id="current-matches">Nearby candidates ({current.length})</h2>
        {displayed.length ? <MatchCards rows={displayed} analyzed={Boolean(analysis)} ranked={Boolean(analysis)} contactActive={contactActive} onConfirmed={onConfirmed} /> : <p className="card">{unscored.length ? "No scored donors in this view. Donors without predictions are shown below." : result.message || "No nearby donors found. Try a larger search radius."}</p>}
      </section>
      {unscored.length > 0 && <section className="dash-stack"><h2>Donors without predictions ({unscored.length})</h2><MatchCards rows={unscored} analyzed ranked contactActive={contactActive} onConfirmed={onConfirmed} /></section>}
      {result.review_candidates?.length > 0 && <section className="dash-stack"><h2>Hospital review required</h2><MatchCards rows={result.review_candidates} /></section>}
      {history.length > 0 && <section className="dash-stack"><h2>Previous matches requiring review</h2><p>These records are retained as history and are not current recommendations.</p><MatchCards rows={history} history analyzed={Boolean(analysis)} ranked={Boolean(analysis)} contactActive={contactActive} onConfirmed={onConfirmed} /></section>}
    </>}
  </div>;
}

export default function HospitalDonorMatches() {
  return <VerifiedHospitalGate>{() => <MatchingView />}</VerifiedHospitalGate>;
}

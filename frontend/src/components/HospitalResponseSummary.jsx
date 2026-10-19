import { useEffect, useRef, useState } from "react";
import Alert from "./Alert";
import Button from "./Button";
import { getResponseSummary } from "../services/notificationService";
import { notificationError } from "../utils/matchStatus";

const labels = [["total_matched", "Total Matched"], ["awaiting_response", "Awaiting Response"], ["available", "Available Donors"], ["not_available", "Not Available"], ["contacted", "Contacted"]];
export default function HospitalResponseSummary({ requestId, refreshKey, onLoaded }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const callback = useRef(onLoaded);
  const refresh = useRef(() => {});
  useEffect(() => { callback.current = onLoaded; }, [onLoaded]);
  useEffect(() => {
    let alive = true, sequence = 0;
    async function load() {
      const token = ++sequence;
      setLoading(true);
      try {
        const value = await getResponseSummary(requestId);
        if (alive && token === sequence) { setData(value); setError(""); callback.current(value); }
      } catch (err) { if (alive && token === sequence) setError(notificationError(err)); }
      finally { if (alive && token === sequence) setLoading(false); }
    }
    refresh.current = load;
    load();
    const visibleLoad = () => { if (document.visibilityState !== "hidden") load(); };
    window.addEventListener("focus", visibleLoad);
    const timer = window.setInterval(visibleLoad, 30000);
    return () => { alive = false; sequence++; window.removeEventListener("focus", visibleLoad); window.clearInterval(timer); };
  }, [requestId, refreshKey]);
  return <section className="card dash-stack" aria-labelledby="responses-title">
    <div className="card-head"><h2 id="responses-title">Donor responses</h2><Button variant="secondary" loading={loading} onClick={() => refresh.current()}>Refresh Responses</Button></div>
    <Alert tone="error">{error}</Alert>
    {data && <dl className="count-row">{labels.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{data[key]}</dd></div>)}</dl>}
    <p className="card-note">Contacted counts matches currently at Contact Attempted. A later donor response replaces that stage; it does not prove WhatsApp delivery. Counts include retained matches. Refreshes every 30 seconds and when this window regains focus.</p>
  </section>;
}

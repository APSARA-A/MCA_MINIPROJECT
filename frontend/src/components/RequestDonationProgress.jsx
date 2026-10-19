import { useEffect, useRef, useState } from "react";
import Alert from "./Alert";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import { getDonationProgress, fulfillRequest } from "../services/donationService";
import { notificationError } from "../utils/matchStatus";
export default function RequestDonationProgress({ requestId, onFulfilled }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState(false), [pending, setPending] = useState(false);
  const busy = useRef(false), sequence = useRef(0), callback = useRef(onFulfilled), reload = useRef(() => {});
  useEffect(() => { callback.current = onFulfilled; }, [onFulfilled]);
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null); setDialog(false); setPending(false); busy.current = false;
    async function load() {
      const token = ++sequence.current;
      try { const fresh = await getDonationProgress(requestId); if (alive && token === sequence.current) { setData(fresh); setError(""); } }
      catch (err) { if (alive && token === sequence.current) setError(notificationError(err)); }
    }
    reload.current = load; load();
    // Invalidate in-flight progress and mutation requests on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { alive = false; sequence.current++; };
  }, [requestId]);
  async function confirm() {
    if (busy.current) return;
    busy.current = true; const token = ++sequence.current; setPending(true); setError("");
    try { const fresh = await fulfillRequest(requestId); if (token === sequence.current) { setData(fresh); setDialog(false); setNotice("Emergency request fulfilled."); callback.current?.(fresh); } }
    catch (err) { if (token === sequence.current) setError(notificationError(err)); }
    finally { if (token === sequence.current) { busy.current = false; setPending(false); } }
  }
  return <section className="card dash-stack" aria-labelledby="donation-progress-title">
    <h2 id="donation-progress-title">Donation Progress</h2><Alert tone="error">{dialog ? "" : error}</Alert><Alert tone="success">{notice}</Alert>
    {data && <><dl className="count-row"><div><dt>Completed units</dt><dd>{data.completed_units}</dd></div><div><dt>Required units</dt><dd>{data.units_required}</dd></div><div><dt>Remaining units</dt><dd>{data.remaining_units}</dd></div></dl><p>Request status: {data.request_status}</p>
      {data.can_fulfill && <Button disabled={pending} onClick={() => setDialog(true)}>Confirm Request Fulfillment</Button>}
      {!data.can_fulfill && data.request_status !== "FULFILLED" && <p>Fulfillment requires enough recorded completed units and an active request.</p>}
    </>}
    <Button variant="secondary" disabled={pending} onClick={() => reload.current()}>Refresh Donation Progress</Button>
    {dialog && <ConfirmDialog title="Confirm request fulfillment" confirmLabel="Fulfill Request" cancelLabel="Cancel" busy={pending} onConfirm={confirm} onCancel={() => setDialog(false)}><p>Confirm that the recorded completed units meet this request and the hospital considers it fulfilled.</p><Alert tone="error">{error}</Alert></ConfirmDialog>}
  </section>;
}

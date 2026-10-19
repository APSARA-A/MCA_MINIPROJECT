import { useCallback, useEffect, useRef, useState } from "react";
import { getScreening } from "../services/screeningService";
import { notificationError } from "../utils/matchStatus";

export default function useMatchWorkflow(matchId) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false);
  const generation = useRef(0), busy = useRef(false);
  const reload = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setError("");
    try { const fresh = await getScreening(matchId); if (token === generation.current) setData(fresh); }
    catch (err) { if (token === generation.current) setError(notificationError(err)); }
    finally { if (token === generation.current) setLoading(false); }
  }, [matchId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null); setNotice(""); setPending(false); busy.current = false;
    reload();
    // Invalidate in-flight work when this match leaves the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; };
  }, [reload]);
  async function run(task, message) {
    if (busy.current) return false;
    busy.current = true; const token = ++generation.current;
    setPending(true); setError(""); setNotice("");
    try {
      const fresh = await task();
      if (token !== generation.current) return false;
      setData(fresh); setNotice(message); return true;
    } catch (err) {
      if (token === generation.current) setError(notificationError(err));
      if (err?.response?.status === 409) {
        try { const fresh = await getScreening(matchId); if (token === generation.current) setData(fresh); } catch { /* Keep the action error. */ }
      }
      return false;
    } finally { if (token === generation.current) { busy.current = false; setPending(false); } }
  }
  return { data, error, notice, loading, pending, reload, run };
}

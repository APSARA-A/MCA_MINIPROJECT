import { useEffect, useState } from "react";
import { getHealth } from "../services/healthService";

function BackendStatus() {
  const [state, setState] = useState({ phase: "checking", message: "" });

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((data) => {
        if (!cancelled) setState({ phase: "ok", message: `${data.project}: ${data.status}` });
      })
      .catch((err) => {
        if (!cancelled) setState({ phase: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const labels = {
    checking: "Checking backend connection...",
    ok: "Backend connected",
    error: "Backend not reachable",
  };

  return (
    <div className={`status status-${state.phase}`} role="status">
      <span className="status-dot" />
      <strong>{labels[state.phase]}</strong>
      {state.message && <small>{state.message}</small>}
    </div>
  );
}

export default BackendStatus;

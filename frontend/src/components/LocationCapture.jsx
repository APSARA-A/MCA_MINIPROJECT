import { useState } from "react";
import { formatCoordinate, isValidCoordinate } from "../utils/geo";
import { GEO_ERROR_MESSAGES as ERROR_MESSAGES, GEO_OPTIONS, geolocationProblem } from "../utils/geolocate";
import Button from "./Button";

/**
 * Reusable GPS capture. Never asks for permission until the button is clicked,
 * never invents coordinates, and reports { latitude, longitude } as numbers.
 * `value` is null until a valid position is captured.
 */
export default function LocationCapture({ value, onChange, error, purpose = "match you with nearby requests" }) {
  const [phase, setPhase] = useState("idle"); // idle | requesting | failed
  const [message, setMessage] = useState("");
  const [accuracy, setAccuracy] = useState(null);

  const captured = value && isValidCoordinate(value.latitude, value.longitude);
  const unsupported = geolocationProblem();

  function capture() {
    const problem = geolocationProblem();
    if (problem) {
      setPhase("failed");
      setMessage(problem);
      return;
    }
    setPhase("requesting");
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy: meters } = position.coords;
        if (!isValidCoordinate(latitude, longitude)) {
          setPhase("failed");
          setMessage("The device returned an invalid position. Please try again.");
          onChange(null);
          return;
        }
        setAccuracy(Number.isFinite(meters) ? Math.round(meters) : null);
        setPhase("idle");
        onChange({ latitude, longitude });
      },
      (geoError) => {
        setPhase("failed");
        setMessage(ERROR_MESSAGES[geoError.code] || "Location could not be captured. Please try again.");
        onChange(null);
      },
      GEO_OPTIONS
    );
  }

  function clear() {
    setPhase("idle");
    setMessage("");
    setAccuracy(null);
    onChange(null);
  }

  return (
    <div className={`location${captured ? " location-ok" : ""}`}>
      <div className="location-head">
        <span className="location-pin" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
        </span>
        <div>
          <p className="location-title">Your location</p>
          <p className="location-copy">
            We use it only to {purpose}. It is stored with your profile and never shown to other users.
          </p>
        </div>
      </div>

      {captured ? (
        <div className="location-result" role="status">
          <p className="location-success">Location captured successfully</p>
          <dl className="location-coords">
            <div><dt>Latitude</dt><dd>{formatCoordinate(value.latitude)}</dd></div>
            <div><dt>Longitude</dt><dd>{formatCoordinate(value.longitude)}</dd></div>
            {accuracy !== null && <div><dt>Accuracy</dt><dd>about {accuracy} m</dd></div>}
          </dl>
          <div className="location-actions">
            <Button variant="secondary" onClick={capture} loading={phase === "requesting"}>Update location</Button>
            <Button variant="ghost" onClick={clear}>Remove</Button>
          </div>
        </div>
      ) : (
        <div className="location-result">
          <p className="location-missing">
            Location not captured. You can register without it, but location-based matching will need it later.
          </p>
          <div className="location-actions">
            <Button variant="secondary" onClick={capture} loading={phase === "requesting"} disabled={Boolean(unsupported)}>
              {phase === "failed" ? "Try again" : "Enable location"}
            </Button>
          </div>
        </div>
      )}

      {phase === "requesting" && (
        <p className="location-note" role="status">Waiting for your browser. Choose Allow when it asks.</p>
      )}
      {(message || unsupported) && phase !== "requesting" && (
        <p className="field-error" role="alert">{message || unsupported}</p>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <p className="location-note">Location access works on localhost. Live sites need HTTPS.</p>
    </div>
  );
}

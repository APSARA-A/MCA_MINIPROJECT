import { useState } from "react";
import { formatCoordinate, isValidCoordinate } from "../utils/geo";
import { GEO_ERROR_MESSAGES, GEO_OPTIONS, geolocationProblem } from "../utils/geolocate";
import Button from "./Button";

const SOURCE_LABEL = {
  hospital: "Your hospital's saved location",
  browser: "Your current location (from this browser)",
  request: "This request's saved location",
};

/**
 * Shows the coordinates the request will use and lets the user explicitly switch
 * to the browser's current position. Never invents coordinates and never edits
 * the hospital's registered location.
 *
 * value: { latitude, longitude, source } | null
 */
export default function RequestLocationPicker({ value, onChange, hospital, error }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = value && isValidCoordinate(Number(value.latitude), Number(value.longitude));
  const hospitalHasLocation = hospital?.has_location;

  function useCurrentLocation() {
    const problem = geolocationProblem();
    if (problem) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(false);
        if (!isValidCoordinate(coords.latitude, coords.longitude)) {
          setMessage("The device returned an invalid position. Please try again.");
          return;
        }
        onChange({ latitude: coords.latitude, longitude: coords.longitude, source: "browser" });
      },
      (geoError) => {
        setBusy(false);
        // The previously selected coordinates are kept; nothing is substituted.
        setMessage(GEO_ERROR_MESSAGES[geoError.code] || "Location could not be captured. Please try again.");
      },
      GEO_OPTIONS
    );
  }

  return (
    <div className={`req-location${selected ? " is-set" : ""}`}>
      {selected ? (
        <div role="status">
          <p className="req-location-source">{SOURCE_LABEL[value.source] || "Selected location"}</p>
          <dl className="location-coords">
            <div><dt>Latitude</dt><dd>{formatCoordinate(value.latitude)}</dd></div>
            <div><dt>Longitude</dt><dd>{formatCoordinate(value.longitude)}</dd></div>
          </dl>
        </div>
      ) : (
        <p className="location-missing">
          No location selected. Use your current location
          {hospitalHasLocation ? " or your hospital's saved location" : ""} so donors can be matched by distance later.
        </p>
      )}

      <div className="location-actions">
        <Button variant="secondary" onClick={useCurrentLocation} loading={busy}>Use Current Location</Button>
        {hospitalHasLocation && value?.source !== "hospital" && (
          <Button
            variant="ghost"
            onClick={() => {
              setMessage("");
              onChange({ latitude: hospital.latitude, longitude: hospital.longitude, source: "hospital" });
            }}
          >
            Use hospital location
          </Button>
        )}
      </div>

      {busy && <p className="location-note" role="status">Waiting for your browser. Choose Allow when it asks.</p>}
      {message && <p className="field-error" role="alert">{message}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <p className="location-note">Using your current location here does not change your hospital's registered location.</p>
    </div>
  );
}

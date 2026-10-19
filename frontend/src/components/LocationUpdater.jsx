import { useState } from "react";
import { useProfile } from "../context/ProfileContext";
import { parseApiError } from "../services/errors";
import { formatCoordinate, toApiCoordinate } from "../utils/geo";
import Alert from "./Alert";
import Button from "./Button";
import LocationCapture from "./LocationCapture";

/**
 * Captures a fresh GPS fix (only after the user clicks) and saves it with PATCH.
 * Shows the currently saved coordinates; never fabricates any.
 */
export default function LocationUpdater({ profile, purpose }) {
  const { save } = useProfile();
  const [coords, setCoords] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!coords) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await save({ latitude: toApiCoordinate(coords.latitude), longitude: toApiCoordinate(coords.longitude) });
      setCoords(null);
      setSaved(true);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.fields.location || parsed.fields.latitude || parsed.fields.longitude || parsed.general);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="loc-updater">
      <p className="loc-current">
        {profile.has_location ? (
          <>Saved location: <strong>{formatCoordinate(profile.latitude)}, {formatCoordinate(profile.longitude)}</strong></>
        ) : (
          "No location saved yet."
        )}
      </p>
      {saved && <Alert tone="success">Location updated.</Alert>}
      <LocationCapture
        value={coords}
        onChange={(next) => {
          setCoords(next);
          setSaved(false);
          setError("");
        }}
        purpose={purpose}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Button onClick={handleSave} loading={saving} disabled={!coords}>Save location</Button>
      </div>
    </div>
  );
}

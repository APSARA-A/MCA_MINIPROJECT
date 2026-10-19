import { useProfile } from "../context/ProfileContext";
import Alert from "./Alert";
import Button from "./Button";
import LoadingSpinner from "./LoadingSpinner";

/** Renders children(profile) once the profile has loaded; handles loading and error states. */
export default function ProfileGate({ children }) {
  const { status, profile, error, reload } = useProfile();

  if (!profile && status === "loading") return <LoadingSpinner fullPage label="Loading your profile" />;
  if (!profile) {
    return (
      <div className="dash-stack">
        <Alert tone="error" title="Profile unavailable">{error}</Alert>
        <div><Button variant="secondary" onClick={reload}>Try again</Button></div>
      </div>
    );
  }
  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}
      {children(profile)}
    </>
  );
}

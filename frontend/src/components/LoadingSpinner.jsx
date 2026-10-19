export default function LoadingSpinner({ label = "Loading", fullPage = false, inline = false }) {
  if (inline) {
    return <span className="spinner spinner-inline" role="status" aria-label={label} />;
  }
  return (
    <div className={fullPage ? "spinner-page" : "spinner-block"} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="spinner-label">{label}</span>
    </div>
  );
}

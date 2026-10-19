/** Turns an axios error into { general, fields } for forms. */
export function parseApiError(error) {
  if (!error?.response) {
    return {
      general: "Cannot reach the server. Check that the backend is running on port 8000.",
      fields: {},
    };
  }
  const { status, data } = error.response;
  if (status === 429) {
    return { general: "Too many attempts. Wait a minute, then try again.", fields: {} };
  }
  const fields = {};
  let general = "";
  if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      const message = Array.isArray(value) ? value.join(" ") : String(value);
      if (key === "detail" || key === "non_field_errors") general = general || message;
      else fields[key] = message;
    }
  }
  if (!general && Object.keys(fields).length === 0) {
    general = "Something went wrong. Please try again.";
  }
  return { general, fields };
}

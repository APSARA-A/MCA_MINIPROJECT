// Shared by LocationCapture and the emergency request location picker.
export const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

export const GEO_ERROR_MESSAGES = {
  1: "Location permission was denied. Allow location for this site in your browser's address-bar settings, then try again.",
  2: "Your device could not determine its position. Check that location services are on, then try again.",
  3: "Finding your location took too long. Move to an area with better signal and try again.",
};

export function geolocationProblem() {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return "This browser does not support location access.";
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "Location needs a secure page. It works on localhost; live sites must use HTTPS.";
  }
  return "";
}

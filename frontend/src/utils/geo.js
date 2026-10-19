/** Latitude/longitude must be finite numbers in range. Zero is valid. */
export function isValidCoordinate(latitude, longitude) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** The API stores 7 decimal places. */
export const toApiCoordinate = (value) => Number(value).toFixed(7);

export const formatCoordinate = (value) => Number(value).toFixed(6);

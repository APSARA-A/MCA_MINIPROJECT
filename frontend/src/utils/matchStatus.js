export const MATCH_LABEL = { IDENTIFIED: "Matched", CONTACTED: "Contact Attempted", AVAILABLE: "Donor Available", UNAVAILABLE: "Donor Not Available" };
export const matchLabel = status => MATCH_LABEL[status] || status;
export const notificationError = error => {
  const data = error?.response?.data;
  return data?.detail || (data && Object.values(data).flat().join(" ")) || "Unable to reach the server. Please try again.";
};

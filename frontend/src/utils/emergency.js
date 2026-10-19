export const STATUS_LABELS = {
  OPEN: "Open",
  MATCHING: "Matching",
  DONORS_CONTACTED: "Donors Contacted",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
};

export const STATUS_FILTERS = [
  { value: "", label: "All" },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export const URGENCY_OPTIONS = [
  { value: "NORMAL", label: "Normal" },
  { value: "URGENT", label: "Urgent" },
  { value: "CRITICAL", label: "Critical" },
];

export const urgencyLabel = (value) => URGENCY_OPTIONS.find((o) => o.value === value)?.label || value;

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Not available";

export const EMPTY_REQUEST = { patient_reference: "", required_blood_group: "", units_required: "1", urgency: "NORMAL" };

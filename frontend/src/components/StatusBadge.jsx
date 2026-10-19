import { STATUS_LABELS, urgencyLabel } from "../utils/emergency";

const STATUS_TONE = {
  OPEN: "badge-info",
  MATCHING: "badge-warn",
  DONORS_CONTACTED: "badge-warn",
  FULFILLED: "badge-ok",
  CANCELLED: "badge-muted",
  CLOSED: "badge-muted",
};

const URGENCY_TONE = { NORMAL: "badge-muted", URGENT: "badge-warn", CRITICAL: "badge-soft" };

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_TONE[status] || "badge-muted"}`}>{STATUS_LABELS[status] || status}</span>;
}

export function UrgencyBadge({ urgency }) {
  return <span className={`badge ${URGENCY_TONE[urgency] || "badge-muted"}`}>{urgencyLabel(urgency)}</span>;
}

import { matchLabel } from "../utils/matchStatus";

const STEPS = [
  ["IDENTIFIED", "Matched"],
  ["CONTACTED", "Contacted"],
  ["AVAILABLE", "Available"],
  ["ARRIVED", "Arrived"],
  ["SCREENING", "Screening"],
  ["APPROVED", "Approved"],
  ["DONATED", "Donated"],
];
const STOPPED = ["REJECTED", "UNAVAILABLE", "CANCELLED"];

/**
 * Visual progress through the donor workflow. Step names are drawn from data-label
 * with CSS so the stepper adds no duplicate text; the label on the list carries
 * the current stage for assistive technology.
 */
export default function WorkflowStepper({ status }) {
  const stopped = STOPPED.includes(status);
  const index = STEPS.findIndex(([value]) => value === status);
  return (
    <ol className={`stepper${stopped ? " is-stopped" : ""}`} aria-label={`Workflow stage: ${matchLabel(status) || "Unknown"}`}>
      {STEPS.map(([value, label], position) => {
        const state = stopped ? "todo" : position < index ? "done" : position === index ? "current" : "todo";
        return (
          <li key={value} className={`stepper-step is-${state}`} data-label={label}
            aria-current={state === "current" ? "step" : undefined} />
        );
      })}
    </ol>
  );
}

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { parseApiError } from "../services/errors";
import { BLOOD_GROUPS } from "../utils/constants";
import { EMPTY_REQUEST, URGENCY_OPTIONS } from "../utils/emergency";
import { toApiCoordinate } from "../utils/geo";
import Alert from "./Alert";
import Button from "./Button";
import FormInput from "./FormInput";
import RequestLocationPicker from "./RequestLocationPicker";

function validate(form, location) {
  const errors = {};
  if (!form.required_blood_group) errors.required_blood_group = "Select the required blood group.";
  const units = Number(form.units_required);
  if (form.units_required === "" || !Number.isInteger(units) || units < 1 || units > 50) {
    errors.units_required = "Enter a whole number of units between 1 and 50.";
  }
  if (!form.urgency) errors.urgency = "Select an urgency.";
  if (form.patient_reference.trim() && !/^[A-Za-z0-9][A-Za-z0-9 _\-/.#]*$/.test(form.patient_reference.trim())) {
    errors.patient_reference = "Use a case code (letters, digits, spaces and - _ / . #). Do not enter the patient's name.";
  }
  if (!location) errors.location = "Set a request location. Use your hospital's saved location or your current location.";
  return errors;
}

/** Shared by the create and edit pages. onSubmit(payload) must return a promise. */
export default function EmergencyRequestForm({ initialValues = EMPTY_REQUEST, initialLocation, hospital, submitLabel, cancelTo, onSubmit }) {
  const [form, setForm] = useState(initialValues);
  const [location, setLocation] = useState(initialLocation);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false); // blocks double clicks before React re-renders

  const update = (event) => setForm((f) => ({ ...f, [event.target.name]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const clientErrors = validate(form, location);
    setErrors(clientErrors);
    setFormError("");
    if (Object.keys(clientErrors).length) {
      setFormError("Check the highlighted fields and try again.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        patient_reference: form.patient_reference.trim(),
        required_blood_group: form.required_blood_group,
        units_required: Number(form.units_required),
        urgency: form.urgency,
        latitude: toApiCoordinate(location.latitude),
        longitude: toApiCoordinate(location.longitude),
      });
    } catch (error) {
      // Values stay in the form so nothing has to be retyped.
      const parsed = parseApiError(error);
      setErrors({ ...parsed.fields, location: parsed.fields.location || parsed.fields.latitude || parsed.fields.longitude });
      setFormError(parsed.general || "Check the highlighted fields and try again.");
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <Alert tone="error">{formError}</Alert>

      <fieldset>
        <legend>Request details</legend>
        <FormInput label="Patient reference" name="patient_reference" optional maxLength={100} autoComplete="off"
          value={form.patient_reference} onChange={update} error={errors.patient_reference}
          hint="A case code such as CASE-001. Never enter the patient's name or medical details." />
        <div className="form-row">
          <FormInput as="select" label="Required blood group" name="required_blood_group" value={form.required_blood_group}
            onChange={update} error={errors.required_blood_group}>
            <option value="">Select</option>
            {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </FormInput>
          <FormInput label="Units required" name="units_required" type="number" inputMode="numeric" min="1" max="50" step="1"
            value={form.units_required} onChange={update} error={errors.units_required} />
        </div>
        <FormInput as="select" label="Urgency" name="urgency" value={form.urgency} onChange={update} error={errors.urgency}>
          {URGENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FormInput>
      </fieldset>

      <fieldset>
        <legend>Request location</legend>
        <RequestLocationPicker value={location} onChange={setLocation} hospital={hospital} error={errors.location} />
      </fieldset>

      <div className="form-actions">
        <Button type="submit" loading={submitting}>{submitLabel}</Button>
        <Link className="btn btn-ghost" to={cancelTo}>Cancel</Link>
      </div>
    </form>
  );
}

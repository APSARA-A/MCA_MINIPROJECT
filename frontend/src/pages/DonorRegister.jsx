import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Alert from "../components/Alert";
import AuthShell from "../components/AuthShell";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import LocationCapture from "../components/LocationCapture";
import PasswordInput from "../components/PasswordInput";
import { registerDonor } from "../services/authService";
import { parseApiError } from "../services/errors";
import { BLOOD_GROUPS, GENDERS } from "../utils/constants";
import { toApiCoordinate } from "../utils/geo";
import { cleanPhone, isValidPhone, validateEmail, validatePasswordPair } from "../utils/validation";

const EMPTY = {
  full_name: "", email: "", password: "", confirm_password: "", date_of_birth: "", gender: "",
  blood_group: "", phone_number: "", whatsapp_number: "", address: "", weight_kg: "", medical_condition: "",
};

function validate(form) {
  const errors = {};
  if (form.full_name.trim().length < 2) errors.full_name = "Enter your full name.";
  validateEmail(form.email, errors);
  validatePasswordPair(form, errors);
  if (!form.date_of_birth) errors.date_of_birth = "Enter your date of birth.";
  else if (new Date(form.date_of_birth) >= new Date(new Date().toDateString())) {
    errors.date_of_birth = "Date of birth must be in the past.";
  }
  if (!form.gender) errors.gender = "Select a gender.";
  if (!form.blood_group) errors.blood_group = "Select your blood group.";
  if (!form.phone_number.trim()) errors.phone_number = "Enter your phone number.";
  else if (!isValidPhone(form.phone_number)) errors.phone_number = "Use 7 to 14 digits, with an optional leading +.";
  if (form.whatsapp_number.trim() && !isValidPhone(form.whatsapp_number)) {
    errors.whatsapp_number = "Use 7 to 14 digits, with an optional leading +.";
  }
  if (form.weight_kg !== "" && !(Number(form.weight_kg) > 0)) errors.weight_kg = "Enter a weight above 0 kg.";
  return errors;
}

export default function DonorRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [location, setLocation] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Latest selectable date of birth is yesterday (must be in the past).
  const [latestBirthDate] = useState(() => new Date(Date.now() - 864e5).toISOString().slice(0, 10));

  const update = (event) => setForm((f) => ({ ...f, [event.target.name]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const clientErrors = validate(form);
    setErrors(clientErrors);
    setFormError("");
    if (Object.keys(clientErrors).length) {
      setFormError("Check the highlighted fields and try again.");
      return;
    }

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      confirm_password: form.confirm_password,
      date_of_birth: form.date_of_birth,
      gender: form.gender,
      blood_group: form.blood_group,
      phone_number: cleanPhone(form.phone_number),
      whatsapp_number: cleanPhone(form.whatsapp_number),
      address: form.address.trim(),
      medical_condition: form.medical_condition.trim(),
    };
    if (form.weight_kg !== "") payload.weight_kg = form.weight_kg;
    if (location) {
      payload.latitude = toApiCoordinate(location.latitude);
      payload.longitude = toApiCoordinate(location.longitude);
    }

    setSubmitting(true);
    try {
      await registerDonor(payload);
      navigate("/login", { replace: true, state: { registered: { role: "DONOR", email: payload.email } } });
    } catch (error) {
      const parsed = parseApiError(error);
      setErrors(parsed.fields);
      setFormError(parsed.general || "Check the highlighted fields and try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      wide
      title="Be the donor someone is waiting for"
      intro="Register once. When a hospital near you needs your blood group, LifeLink can reach you."
      points={["Matched by blood group and distance", "Your medical notes stay private", "Free for donors"]}
    >
      <div className="auth-card">
        <h1>Donor registration</h1>
        <p className="auth-sub">Takes about two minutes. Fields marked optional can be skipped.</p>
        <Alert tone="error">{formError}</Alert>

        <form onSubmit={handleSubmit} noValidate className="form">
          <fieldset>
            <legend>Account</legend>
            <FormInput label="Full name" name="full_name" autoComplete="name" value={form.full_name}
              onChange={update} error={errors.full_name} />
            <FormInput label="Email" name="email" type="email" autoComplete="email" value={form.email}
              onChange={update} error={errors.email} />
            <div className="form-row">
              <PasswordInput label="Password" name="password" autoComplete="new-password" value={form.password}
                onChange={update} error={errors.password} hint="At least 8 characters. Avoid common or all-number passwords." />
              <PasswordInput label="Confirm password" name="confirm_password" autoComplete="new-password"
                value={form.confirm_password} onChange={update} error={errors.confirm_password} />
            </div>
          </fieldset>

          <fieldset>
            <legend>About you</legend>
            <div className="form-row">
              <FormInput label="Date of birth" name="date_of_birth" type="date" value={form.date_of_birth}
                onChange={update} error={errors.date_of_birth} max={latestBirthDate} />
              <FormInput as="select" label="Gender" name="gender" value={form.gender} onChange={update} error={errors.gender}>
                <option value="">Select</option>
                {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </FormInput>
            </div>
            <div className="form-row">
              <FormInput as="select" label="Blood group" name="blood_group" value={form.blood_group}
                onChange={update} error={errors.blood_group}>
                <option value="">Select</option>
                {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </FormInput>
              <FormInput label="Weight (kg)" name="weight_kg" type="number" inputMode="decimal" min="1" step="0.1"
                optional value={form.weight_kg} onChange={update} error={errors.weight_kg} />
            </div>
          </fieldset>

          <fieldset>
            <legend>Contact</legend>
            <div className="form-row">
              <FormInput label="Phone number" name="phone_number" type="tel" autoComplete="tel" value={form.phone_number}
                onChange={update} error={errors.phone_number} />
              <FormInput label="WhatsApp number" name="whatsapp_number" type="tel" optional value={form.whatsapp_number}
                onChange={update} error={errors.whatsapp_number} hint="Hospitals will use this to reach you." />
            </div>
            <FormInput as="textarea" rows={2} label="Address" name="address" autoComplete="street-address" optional
              value={form.address} onChange={update} error={errors.address} />
            <FormInput label="Medical condition" name="medical_condition" optional maxLength={255}
              value={form.medical_condition} onChange={update} error={errors.medical_condition}
              hint="Anything a doctor should know before you donate. It is not shown on your dashboard." />
          </fieldset>

          <fieldset>
            <legend>Location</legend>
            <LocationCapture value={location} onChange={setLocation} error={errors.location || errors.latitude || errors.longitude}
              purpose="match you with blood requests near you" />
          </fieldset>

          <Button type="submit" loading={submitting} className="btn-block">Create donor account</Button>
        </form>

        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}

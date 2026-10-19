import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Alert from "../components/Alert";
import AuthShell from "../components/AuthShell";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import LocationCapture from "../components/LocationCapture";
import PasswordInput from "../components/PasswordInput";
import { registerHospital } from "../services/authService";
import { parseApiError } from "../services/errors";
import { toApiCoordinate } from "../utils/geo";
import { cleanPhone, isValidPhone, validateEmail, validatePasswordPair } from "../utils/validation";

const EMPTY = {
  hospital_name: "", registration_number: "", email: "", password: "", confirm_password: "",
  phone_number: "", address: "",
};

function validate(form) {
  const errors = {};
  if (form.hospital_name.trim().length < 3) errors.hospital_name = "Enter the hospital's full name.";
  if (!/^[A-Za-z0-9][A-Za-z0-9/-]{3,99}$/.test(form.registration_number.trim())) {
    errors.registration_number = "Use 4 or more letters, digits, hyphens or slashes.";
  }
  validateEmail(form.email, errors);
  validatePasswordPair(form, errors);
  if (!form.phone_number.trim()) errors.phone_number = "Enter a contact number.";
  else if (!isValidPhone(form.phone_number)) errors.phone_number = "Use 7 to 14 digits, with an optional leading +.";
  if (!form.address.trim()) errors.address = "Enter the hospital's address.";
  return errors;
}

export default function HospitalRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [location, setLocation] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      hospital_name: form.hospital_name.trim(),
      registration_number: form.registration_number.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      confirm_password: form.confirm_password,
      phone_number: cleanPhone(form.phone_number),
      address: form.address.trim(),
    };
    if (location) {
      payload.latitude = toApiCoordinate(location.latitude);
      payload.longitude = toApiCoordinate(location.longitude);
    }

    setSubmitting(true);
    try {
      await registerHospital(payload);
      navigate("/login", { replace: true, state: { registered: { role: "HOSPITAL", email: payload.email } } });
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
      title="Reach donors faster when it matters"
      intro="Register your hospital. Once an administrator verifies your registration number, you can raise emergency requests."
      points={["Verified hospitals only", "Donors matched by blood group and distance", "Your registration stays under review until approved"]}
    >
      <div className="auth-card">
        <h1>Hospital registration</h1>
        <p className="auth-sub">New accounts start as pending until an administrator verifies them.</p>
        <Alert tone="error">{formError}</Alert>

        <form onSubmit={handleSubmit} noValidate className="form">
          <fieldset>
            <legend>Hospital</legend>
            <FormInput label="Hospital name" name="hospital_name" value={form.hospital_name}
              onChange={update} error={errors.hospital_name} />
            <FormInput label="Registration number" name="registration_number" value={form.registration_number}
              onChange={update} error={errors.registration_number}
              hint="As printed on your official registration certificate." />
          </fieldset>

          <fieldset>
            <legend>Account</legend>
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
            <legend>Contact</legend>
            <FormInput label="Phone number" name="phone_number" type="tel" autoComplete="tel" value={form.phone_number}
              onChange={update} error={errors.phone_number} />
            <FormInput as="textarea" rows={2} label="Address" name="address" autoComplete="street-address"
              value={form.address} onChange={update} error={errors.address} />
          </fieldset>

          <fieldset>
            <legend>Location</legend>
            <LocationCapture value={location} onChange={setLocation} error={errors.location || errors.latitude || errors.longitude}
              purpose="find donors close to your hospital" />
          </fieldset>

          <Button type="submit" loading={submitting} className="btn-block">Register hospital</Button>
        </form>

        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}

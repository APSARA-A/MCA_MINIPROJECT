import { useState } from "react";
import Alert from "../components/Alert";
import BloodDrop from "../components/BloodDrop";
import Button from "../components/Button";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import FormInput from "../components/FormInput";
import LocationUpdater from "../components/LocationUpdater";
import ProfileGate from "../components/ProfileGate";
import { useProfile } from "../context/ProfileContext";
import { parseApiError } from "../services/errors";
import { GENDER_LABEL, formatDate } from "../utils/format";
import { cleanPhone, isValidPhone } from "../utils/validation";

const fromProfile = (p) => ({
  full_name: p.full_name || "",
  phone_number: p.phone_number || "",
  whatsapp_number: p.whatsapp_number || "",
  address: p.address || "",
  weight_kg: p.weight_kg ? String(Number(p.weight_kg)) : "",
  medical_condition: p.medical_condition || "",
});

function validate(form) {
  const errors = {};
  if (form.full_name.trim().length < 2) errors.full_name = "Enter your full name.";
  if (!form.phone_number.trim()) errors.phone_number = "Enter your phone number.";
  else if (!isValidPhone(form.phone_number)) errors.phone_number = "Use 7 to 14 digits, with an optional leading +.";
  if (form.whatsapp_number.trim() && !isValidPhone(form.whatsapp_number)) {
    errors.whatsapp_number = "Use 7 to 14 digits, with an optional leading +.";
  }
  if (form.weight_kg !== "") {
    const weight = Number(form.weight_kg);
    if (!(weight > 0) || weight > 300) errors.weight_kg = "Enter a weight between 1 and 300 kg.";
  }
  return errors;
}

function ProfileForm({ profile }) {
  const { save } = useProfile();
  const [form, setForm] = useState(() => fromProfile(profile));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(fromProfile(profile));
  const update = (event) => {
    setForm((f) => ({ ...f, [event.target.name]: event.target.value }));
    setSaved(false);
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const clientErrors = validate(form);
    setErrors(clientErrors);
    setFormError("");
    setSaved(false);
    if (Object.keys(clientErrors).length) {
      setFormError("Check the highlighted fields and try again.");
      return;
    }
    setSaving(true);
    try {
      const updated = await save({
        full_name: form.full_name.trim(),
        phone_number: cleanPhone(form.phone_number),
        whatsapp_number: cleanPhone(form.whatsapp_number),
        address: form.address.trim(),
        weight_kg: form.weight_kg === "" ? null : form.weight_kg,
        medical_condition: form.medical_condition.trim(),
      });
      setForm(fromProfile(updated));
      setSaved(true);
    } catch (error) {
      const parsed = parseApiError(error);
      setErrors(parsed.fields);
      setFormError(parsed.general || "Check the highlighted fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dash-stack">
      <PageHeader title="My profile">
        <p>Keep your contact details current so hospitals can reach you.</p>
      </PageHeader>

      <div className="profile-layout">
        <aside className="card profile-summary">
          <span className="avatar avatar-xl" data-initial={(profile.full_name || "?").charAt(0).toUpperCase()} aria-hidden="true" />
          <p className="profile-name">{profile.full_name}</p>
          <BloodDrop group={profile.blood_group} size="lg" />
          <p className="profile-meta"><Icon name="clock" size={16} />Member since {formatDate(profile.created_at)}</p>
        </aside>

        <div className="dash-stack">
      <section className="card" aria-labelledby="locked-title">
        <h2 id="locked-title">Identity details</h2>
        <p className="card-note">These are locked because they affect medical suitability. They cannot be edited here.</p>
        <div className="form-row">
          <FormInput label="Blood group" value={profile.blood_group} disabled readOnly />
          <FormInput label="Date of birth" value={profile.date_of_birth} disabled readOnly />
        </div>
        <div className="form-row">
          <FormInput label="Email" value={profile.email} disabled readOnly />
          <FormInput label="Gender" value={GENDER_LABEL[profile.gender] || profile.gender} disabled readOnly />
        </div>
      </section>

      <section className="card" aria-labelledby="edit-title">
        <h2 id="edit-title">Contact and health details</h2>
        {saved && <Alert tone="success">Profile saved.</Alert>}
        <Alert tone="error">{formError}</Alert>
        <form className="form" onSubmit={handleSubmit} noValidate>
          <FormInput label="Full name" name="full_name" autoComplete="name" value={form.full_name}
            onChange={update} error={errors.full_name} />
          <div className="form-row">
            <FormInput label="Phone number" name="phone_number" type="tel" autoComplete="tel" value={form.phone_number}
              onChange={update} error={errors.phone_number} />
            <FormInput label="WhatsApp number" name="whatsapp_number" type="tel" optional value={form.whatsapp_number}
              onChange={update} error={errors.whatsapp_number} />
          </div>
          <FormInput as="textarea" rows={2} label="Address" name="address" autoComplete="street-address" optional
            value={form.address} onChange={update} error={errors.address} />
          <div className="form-row">
            <FormInput label="Weight (kg)" name="weight_kg" type="number" inputMode="decimal" min="1" step="0.1" optional
              value={form.weight_kg} onChange={update} error={errors.weight_kg} />
            <FormInput label="Medical condition" name="medical_condition" optional maxLength={255}
              value={form.medical_condition} onChange={update} error={errors.medical_condition}
              hint="Only you can see this on LifeLink." />
          </div>
          <div className="form-actions">
            <Button type="submit" loading={saving} disabled={!dirty}>Save changes</Button>
          </div>
        </form>
      </section>

      <section className="card" aria-labelledby="loc-edit-title">
        <h2 id="loc-edit-title">Location</h2>
        <LocationUpdater profile={profile} purpose="match you with blood requests near you" />
      </section>
        </div>
      </div>
    </div>
  );
}

export default function DonorProfile() {
  return <ProfileGate>{(profile) => <ProfileForm profile={profile} />}</ProfileGate>;
}

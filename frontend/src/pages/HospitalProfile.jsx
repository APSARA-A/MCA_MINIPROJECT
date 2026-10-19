import { useState } from "react";
import Alert from "../components/Alert";
import Button from "../components/Button";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import FormInput from "../components/FormInput";
import LocationUpdater from "../components/LocationUpdater";
import ProfileGate from "../components/ProfileGate";
import { useProfile } from "../context/ProfileContext";
import { parseApiError } from "../services/errors";
import { formatDate } from "../utils/format";
import { cleanPhone, isValidPhone } from "../utils/validation";

const fromProfile = (p) => ({ phone_number: p.phone_number || "", address: p.address || "" });

function validate(form) {
  const errors = {};
  if (!form.phone_number.trim()) errors.phone_number = "Enter a contact number.";
  else if (!isValidPhone(form.phone_number)) errors.phone_number = "Use 7 to 14 digits, with an optional leading +.";
  if (!form.address.trim()) errors.address = "Enter the hospital's address.";
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
      // Only the two editable fields are ever sent; the API rejects anything else.
      const updated = await save({ phone_number: cleanPhone(form.phone_number), address: form.address.trim() });
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
      <PageHeader title="Hospital profile">
        <p>Update how donors and LifeLink can reach your hospital.</p>
      </PageHeader>

      <div className="profile-layout">
        <aside className="card profile-summary">
          <span className="avatar avatar-xl avatar-square" aria-hidden="true"><Icon name="hospital" size={34} strokeWidth={1.6} /></span>
          <p className="profile-name">{profile.hospital_name}</p>
          <p className="profile-meta"><Icon name="clock" size={16} />Registered {formatDate(profile.created_at)}</p>
        </aside>

        <div className="dash-stack">
      <section className="card" aria-labelledby="h-locked-title">
        <h2 id="h-locked-title">Registration details</h2>
        <p className="card-note">These come from your verified registration and cannot be edited here.</p>
        <div className="form-row">
          <FormInput label="Hospital name" value={profile.hospital_name} disabled readOnly />
          <FormInput label="Registration number" value={profile.registration_number} disabled readOnly />
        </div>
        <div className="form-row">
          <FormInput label="Email" value={profile.email} disabled readOnly />
          <FormInput label="Verification status" disabled readOnly
            value={profile.is_verified ? "Verified Hospital" : "Verification Pending"} />
        </div>
      </section>

      <section className="card" aria-labelledby="h-edit-title">
        <h2 id="h-edit-title">Contact details</h2>
        {saved && <Alert tone="success">Profile saved. Your verification status has not changed.</Alert>}
        <Alert tone="error">{formError}</Alert>
        <form className="form" onSubmit={handleSubmit} noValidate>
          <FormInput label="Phone number" name="phone_number" type="tel" autoComplete="tel" value={form.phone_number}
            onChange={update} error={errors.phone_number} />
          <FormInput as="textarea" rows={3} label="Address" name="address" autoComplete="street-address"
            value={form.address} onChange={update} error={errors.address} />
          <div className="form-actions">
            <Button type="submit" loading={saving} disabled={!dirty}>Save changes</Button>
          </div>
        </form>
      </section>

      <section className="card" aria-labelledby="h-loc-edit-title">
        <h2 id="h-loc-edit-title">Location</h2>
        <LocationUpdater profile={profile} purpose="find donors close to your hospital" />
      </section>
        </div>
      </div>
    </div>
  );
}

export default function HospitalProfile() {
  return <ProfileGate>{(profile) => <ProfileForm profile={profile} />}</ProfileGate>;
}

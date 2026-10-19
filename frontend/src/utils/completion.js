const filled = (value) => value !== null && value !== undefined && String(value).trim() !== "";

/**
 * Profile completion from fields actually saved on the donor record.
 * The optional medical-condition disclosure is deliberately not counted.
 */
export function donorCompletion(profile) {
  const items = [
    { key: "full_name", label: "Full name", done: filled(profile.full_name) },
    { key: "date_of_birth", label: "Date of birth", done: filled(profile.date_of_birth) },
    { key: "gender", label: "Gender", done: filled(profile.gender) },
    { key: "blood_group", label: "Blood group", done: filled(profile.blood_group) },
    { key: "phone_number", label: "Phone number", done: filled(profile.phone_number) },
    { key: "whatsapp_number", label: "WhatsApp number", done: filled(profile.whatsapp_number) },
    { key: "address", label: "Address", done: filled(profile.address) },
    { key: "weight_kg", label: "Weight", done: filled(profile.weight_kg) },
    { key: "location", label: "Location", done: Boolean(profile.has_location) },
  ];
  const done = items.filter((item) => item.done).length;
  return {
    percent: Math.round((done / items.length) * 100),
    missing: items.filter((item) => !item.done),
  };
}

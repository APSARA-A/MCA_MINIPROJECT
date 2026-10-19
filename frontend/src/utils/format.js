export const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : "Not available";

export const GENDER_LABEL = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

export const orNotProvided = (value) => (value && String(value).trim() ? value : "Not provided");

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Removes spaces, dashes and brackets people type into phone numbers. */
export const cleanPhone = (value) => value.replace(/[\s\-()]/g, "");

export const isValidPhone = (value) => /^\+?[0-9]{7,14}$/.test(cleanPhone(value));

export function validatePasswordPair(form, errors) {
  if (!form.password) errors.password = "Enter a password.";
  else if (form.password.length < 8) errors.password = "Use at least 8 characters.";
  if (!form.confirm_password) errors.confirm_password = "Confirm your password.";
  else if (form.password !== form.confirm_password) {
    errors.confirm_password = "Passwords do not match.";
  }
}

export function validateEmail(value, errors) {
  if (!value.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL_RE.test(value.trim())) errors.email = "Enter a valid email address.";
}

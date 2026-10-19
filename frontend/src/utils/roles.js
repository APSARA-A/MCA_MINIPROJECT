export const ROLES = { DONOR: "DONOR", HOSPITAL: "HOSPITAL", ADMIN: "ADMIN" };

export const ROLE_HOME = {
  DONOR: "/donor/dashboard",
  HOSPITAL: "/hospital/dashboard",
  ADMIN: "/admin-access",
};

export const homePathFor = (role) => ROLE_HOME[role] || "/";

export const DJANGO_ADMIN_URL = `${
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
}/admin/`;

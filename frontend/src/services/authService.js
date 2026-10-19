import api from "./api";
import { tokenStorage } from "./tokenStorage";

export async function registerDonor(payload) {
  const { data } = await api.post("/api/auth/register/donor/", payload);
  return data;
}

export async function registerHospital(payload) {
  const { data } = await api.post("/api/auth/register/hospital/", payload);
  return data;
}

/** Signs in, stores the tokens and returns the account summary. */
export async function login(email, password) {
  const { data } = await api.post("/api/auth/login/", { email, password });
  tokenStorage.set({ access: data.access, refresh: data.refresh });
  return data.user;
}

export async function fetchMe() {
  const { data } = await api.get("/api/auth/me/");
  return data;
}

export function logout() {
  tokenStorage.clear();
}

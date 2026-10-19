import api from "./api";

export async function fetchDonorProfile() {
  const { data } = await api.get("/api/donors/me/");
  return data;
}

export async function updateDonorProfile(patch) {
  const { data } = await api.patch("/api/donors/me/", patch);
  return data;
}

export async function fetchHospitalProfile() {
  const { data } = await api.get("/api/hospitals/me/");
  return data;
}

export async function updateHospitalProfile(patch) {
  const { data } = await api.patch("/api/hospitals/me/", patch);
  return data;
}

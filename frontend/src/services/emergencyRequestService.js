import api from "./api";

const BASE = "/api/emergency-requests/";

/** params: { status, urgency, required_blood_group, page } (empty values are dropped). */
export async function listRequests(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v != null));
  const { data } = await api.get(BASE, { params: clean });
  return data;
}

export async function getRequest(id) {
  const { data } = await api.get(`${BASE}${id}/`);
  return data;
}

export async function createRequest(payload) {
  const { data } = await api.post(BASE, payload);
  return data;
}

export async function updateRequest(id, patch) {
  const { data } = await api.patch(`${BASE}${id}/`, patch);
  return data;
}

export async function cancelRequest(id) {
  const { data } = await api.post(`${BASE}${id}/cancel/`);
  return data;
}

export async function getSummary() {
  const { data } = await api.get(`${BASE}summary/`);
  return data;
}

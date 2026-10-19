import api from "./api";

const base = (id) => `/api/matching/requests/${id}/`;
export async function getMatches(id, radius = 25) {
  const { data } = await api.get(base(id), { params: { radius_km: radius } });
  return data;
}
export async function generateMatches(id, radius = 25) {
  const { data } = await api.post(`${base(id)}generate/`, { radius_km: radius });
  return data;
}

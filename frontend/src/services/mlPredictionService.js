import api from "./api";

export async function getPredictions(id, { radius_km = 25, ranking = "NEAREST" } = {}) {
  const { data } = await api.get(`/api/ml/requests/${id}/predictions/`, { params: { radius_km, ranking } });
  return data;
}

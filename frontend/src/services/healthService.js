import api from "./api";

export async function getHealth() {
  const response = await api.get("/api/health/");
  return response.data;
}

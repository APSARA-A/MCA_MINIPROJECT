import axios from "axios";
import { tokenStorage } from "./tokenStorage";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  config._sessionRefresh = tokenStorage.getRefresh();
  const token = tokenStorage.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshInFlight = null;

function sameSession(refresh) { return tokenStorage.getRefresh() === refresh; }

async function refreshAccessToken() {
  const refresh = tokenStorage.getRefresh();
  if (!refresh) throw new Error("No refresh token");
  // Plain axios on purpose: avoids re-entering this interceptor.
  const { data } = await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, { refresh }, { timeout: 10000 });
  if (!sameSession(refresh)) throw new Error("Session changed during refresh");
  tokenStorage.set({ access: data.access, refresh: data.refresh });
  return data.access;
}

function endSession() {
  tokenStorage.clear();
  window.dispatchEvent(new Event("auth:logout"));
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthCall = /\/api\/auth\/(login|token\/refresh)\//.test(original?.url || "");
    if (error.response?.status !== 401 || !original || isAuthCall) {
      return Promise.reject(error);
    }
    if (original._sessionRefresh !== tokenStorage.getRefresh()) return Promise.reject(error);
    if (original._retried || !tokenStorage.getRefresh()) {
      endSession();
      return Promise.reject(error);
    }
    original._retried = true;
    const session = tokenStorage.getRefresh();
    try {
      if (!refreshInFlight || refreshInFlight.session !== session) {
        const flight = { session };
        flight.promise = refreshAccessToken().finally(() => { if (refreshInFlight === flight) refreshInFlight = null; });
        refreshInFlight = flight;
      }
      const access = await refreshInFlight.promise;
      if (!sameSession(session)) return Promise.reject(error);
      original.headers.Authorization = `Bearer ${access}`;
      return api(original);
    } catch {
      if (sameSession(session)) endSession();
      return Promise.reject(error);
    }
  }
);

export default api;

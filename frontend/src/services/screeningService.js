import api from "./api";
const base = id => `/api/screening/matches/${id}/`;
export async function getScreening(id) { return (await api.get(base(id))).data; }
export async function markArrived(id) { return (await api.post(`${base(id)}mark-arrived/`, {})).data; }
export async function startScreening(id) { return (await api.post(`${base(id)}start/`, {})).data; }
export async function recordDecision(id, data) { return (await api.post(`${base(id)}decision/`, data)).data; }
export async function getScreeningSummary() { return (await api.get("/api/screening/hospital/summary/")).data; }
export async function getScreeningQueue(page = 1) { return (await api.get("/api/screening/hospital/queue/", { params: { page } })).data; }

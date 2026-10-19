import api from "./api";

const matchUrl = id => `/api/notifications/matches/${id}/`;
export async function getWhatsAppLink(id) { return (await api.get(`${matchUrl(id)}whatsapp-link/`)).data; }
export async function markContacted(id) { return (await api.post(`${matchUrl(id)}mark-contacted/`, {})).data; }
export async function respondToMatch(id, response) { return (await api.post(`${matchUrl(id)}respond/`, { response })).data; }
export async function getDonorRequests() { return (await api.get("/api/notifications/donor/requests/")).data; }
export async function getResponseSummary(id) { return (await api.get(`/api/notifications/requests/${id}/responses/`)).data; }

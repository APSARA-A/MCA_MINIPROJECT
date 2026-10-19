import api from "./api";
export async function completeDonation(id, data) { return (await api.post(`/api/donations/matches/${id}/complete/`, data)).data; }
export async function fulfillRequest(id) { return (await api.post(`/api/donations/requests/${id}/fulfill/`, { confirmed_fulfillment: true })).data; }
export async function getDonationProgress(id) { return (await api.get(`/api/donations/requests/${id}/progress/`)).data; }
export async function getDonorHistory(page = 1) { return (await api.get("/api/donations/donor/history/", { params: { page } })).data; }
export async function getHospitalHistory(params = {}) { return (await api.get("/api/donations/hospital/history/", { params })).data; }

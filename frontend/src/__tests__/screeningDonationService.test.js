import { beforeEach, expect, it, vi } from "vitest";
import api from "../services/api";
import * as screening from "../services/screeningService";
import * as donations from "../services/donationService";
vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { ok: true } }); api.post.mockResolvedValue({ data: { ok: true } }); });
it("uses authenticated screening endpoints with explicit decisions", async () => {
  await screening.getScreening(4);await screening.markArrived(4);await screening.startScreening(4);await screening.recordDecision(4,{ screening_status: "APPROVED", screened_by: "QA" });
  expect(api.get).toHaveBeenCalledWith("/api/screening/matches/4/");
  expect(api.post.mock.calls).toEqual([["/api/screening/matches/4/mark-arrived/",{}],["/api/screening/matches/4/start/",{}],["/api/screening/matches/4/decision/",{ screening_status: "APPROVED", screened_by: "QA" }]]);
});
it("uses donation endpoints and sends fulfillment confirmation", async () => {
  await donations.completeDonation(4,{confirmed_completed:true});await donations.fulfillRequest(7);await donations.getDonationProgress(7);await donations.getDonorHistory(2);await donations.getHospitalHistory({request_id:7,page:2});
  expect(api.post.mock.calls).toEqual([["/api/donations/matches/4/complete/",{confirmed_completed:true}],["/api/donations/requests/7/fulfill/",{confirmed_fulfillment:true}]]);
  expect(api.get.mock.calls).toEqual([["/api/donations/requests/7/progress/"],["/api/donations/donor/history/",{params:{page:2}}],["/api/donations/hospital/history/",{params:{request_id:7,page:2}}]]);
});
it("uses owned queue/summary and propagates errors to existing JWT handling", async () => {
  await screening.getScreeningSummary();await screening.getScreeningQueue(2);
  expect(api.get).toHaveBeenCalledWith("/api/screening/hospital/queue/",{params:{page:2}});
  api.post.mockRejectedValue({response:{status:409}});await expect(screening.markArrived(4)).rejects.toMatchObject({response:{status:409}});
});

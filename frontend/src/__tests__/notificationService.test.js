import { beforeEach, expect, it, vi } from "vitest";
import api from "../services/api";
import { getWhatsAppLink, markContacted, respondToMatch, getDonorRequests, getResponseSummary } from "../services/notificationService";
vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { ok: true } }); api.post.mockResolvedValue({ data: { ok: true } }); });
it("uses the authenticated instance and exact notification GET endpoints", async () => {
  expect(await getWhatsAppLink(4)).toEqual({ ok: true }); await getDonorRequests(); await getResponseSummary(7);
  expect(api.get.mock.calls).toEqual([["/api/notifications/matches/4/whatsapp-link/"], ["/api/notifications/donor/requests/"], ["/api/notifications/requests/7/responses/"]]);
});
it("posts only the explicit action or response, with no donor id", async () => {
  await markContacted(4); await respondToMatch(4, "NOT_AVAILABLE");
  expect(api.post.mock.calls).toEqual([["/api/notifications/matches/4/mark-contacted/", {}], ["/api/notifications/matches/4/respond/", { response: "NOT_AVAILABLE" }]]);
});
it("propagates API errors to the existing error/session handling", async () => {
  const error = { response: { status: 401 } }; api.get.mockRejectedValue(error);
  await expect(getWhatsAppLink(4)).rejects.toBe(error);
});

import { expect, it, vi } from "vitest";
import api from "../services/api";
import { getMatches, generateMatches } from "../services/matchingService";
vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
it("uses the matching GET endpoint and radius", async () => {
  api.get.mockResolvedValue({ data: { matches: [] } });
  expect(await getMatches(12, 5)).toEqual({ matches: [] });
  expect(api.get).toHaveBeenCalledWith("/api/matching/requests/12/", { params: { radius_km: 5 } });
});
it("uses the generation POST endpoint and default radius", async () => {
  api.post.mockResolvedValue({ data: { total_matches: 0 } });
  expect(await generateMatches(12)).toEqual({ total_matches: 0 });
  expect(api.post).toHaveBeenCalledWith("/api/matching/requests/12/generate/", { radius_km: 25 });
});

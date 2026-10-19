import { expect, it, vi } from "vitest";
import api from "../services/api";
import { getPredictions } from "../services/mlPredictionService";
vi.mock("../services/api", () => ({ default: { get: vi.fn() } }));
it("uses authenticated ML endpoint and default nearest ranking", async () => {
  api.get.mockResolvedValue({ data: { predictions: [] } });
  expect(await getPredictions(7)).toEqual({ predictions: [] });
  expect(api.get).toHaveBeenCalledWith("/api/ml/requests/7/predictions/", { params: { radius_km: 25, ranking: "NEAREST" } });
});
it("sends selected radius and ranking", async () => {
  api.get.mockResolvedValue({ data: {} });
  await getPredictions(7, { radius_km: 50, ranking: "COMBINED" });
  expect(api.get).toHaveBeenLastCalledWith("/api/ml/requests/7/predictions/", { params: { radius_km: 50, ranking: "COMBINED" } });
});

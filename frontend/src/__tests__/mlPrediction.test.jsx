import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import * as notifications from "../services/notificationService";
import App from "../App";
import * as profileService from "../services/profileService";
import * as matching from "../services/matchingService";
import * as ml from "../services/mlPredictionService";

vi.mock("../services/notificationService", () => ({ getResponseSummary: vi.fn(), getDonorRequests: vi.fn(), getWhatsAppLink: vi.fn(), markContacted: vi.fn(), respondToMatch: vi.fn() }));
const auth = { user: { role: "HOSPITAL" }, status: "authenticated", logout: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../services/profileService", () => ({ fetchHospitalProfile: vi.fn(), fetchDonorProfile: vi.fn(), updateDonorProfile: vi.fn(), updateHospitalProfile: vi.fn() }));
vi.mock("../services/matchingService", () => ({ getMatches: vi.fn(), generateMatches: vi.fn() }));
vi.mock("../services/mlPredictionService", () => ({ getPredictions: vi.fn() }));
vi.mock("../components/BackendStatus", () => ({ default: () => null }));
const row = (id, name, distance, probability) => ({ match_id: id, donor_name: name, blood_group: "O-", distance_km: distance,
  eligible_for_contact: true, system_eligible: true, prescreening_outcome: "REVIEW_REQUIRED", screening_required: true,
  match_status: "IDENTIFIED", prediction_available: probability != null, donation_probability: probability,
  unavailable_reason: probability == null ? "INSUFFICIENT_DONATION_HISTORY" : null });
const near = row(1, "Near donor", 1, .2), high = row(2, "Higher propensity", 2, .824), fresh = row(3, "New donor", 3, null);
const base = { request_id: 7, request_status: "MATCHING", required_blood_group: "O+", units_required: 2, urgency: "CRITICAL", matches: [near, high, fresh] };
const predictions = rows => ({ request_id: 7, model_name: "Random Forest", model_available: true, reference_date: "2026-10-11", predictions: rows, total_matches: rows.length });
function renderAt() { return render(<MemoryRouter initialEntries={["/hospital/emergency/7/matches"]}><App /></MemoryRouter>); }
async function analyze() { await userEvent.click(await screen.findByRole("button", { name: "Analyze Donation Propensity" })); }
beforeEach(() => {
  vi.clearAllMocks();
  notifications.getResponseSummary.mockResolvedValue({ request_id: 7, matches: [], total_matched: 0, awaiting_response: 0, available: 0, not_available: 0, contacted: 0 });
  notifications.getDonorRequests.mockResolvedValue({ pending_count: 0, active_requests: [], historical_requests: [] });
  auth.user = { role: "HOSPITAL" };
  profileService.fetchHospitalProfile.mockResolvedValue({ hospital_id: 1, is_verified: true, is_active: true });
  matching.getMatches.mockResolvedValue(base);
  matching.generateMatches.mockResolvedValue(base);
  ml.getPredictions.mockResolvedValue(predictions([near, high, fresh]));
});
it("requests optional analysis, shows real one-decimal percentages and no fabricated new-donor score", async () => {
  renderAt();
  await screen.findByRole("heading", { name: "Near donor" });
  expect(screen.queryByText("82.4%")).not.toBeInTheDocument();
  await analyze();
  expect(await screen.findByText("82.4%")).toBeInTheDocument();
  expect(screen.getByText("Insufficient Donation History")).toBeInTheDocument();
  expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  expect(ml.getPredictions).toHaveBeenCalledWith("7", { radius_km: 25, ranking: "NEAREST" });
  expect(matching.generateMatches).not.toHaveBeenCalled();
  expect(within(screen.getAllByRole("article")[0]).getByRole("heading")).toHaveTextContent("Near donor");
});
it("highest propensity shows scored ranking and a separate visible unscored section", async () => {
  renderAt(); await analyze(); await screen.findByText("82.4%");
  ml.getPredictions.mockResolvedValue(predictions([high, near, fresh]));
  await userEvent.selectOptions(screen.getByLabelText("Donor ranking"), "PROPENSITY");
  await screen.findByRole("heading", { name: "Donors without predictions (1)" });
  expect(within(screen.getAllByRole("article")[0]).getByRole("heading")).toHaveTextContent("Higher propensity");
  expect(screen.getByRole("heading", { name: "New donor" })).toBeInTheDocument();
  expect(ml.getPredictions).toHaveBeenLastCalledWith("7", { radius_km: 25, ranking: "PROPENSITY" });
});
it("combined respects backend eligibility and does not promote restricted records", async () => {
  const restricted = { ...row(4, "Restricted donor", .1, 1), eligible_for_contact: false, current_issues: ["Interval restriction."] };
  renderAt(); await analyze(); await screen.findByText("82.4%");
  ml.getPredictions.mockResolvedValue(predictions([high, near, fresh, restricted]));
  await userEvent.selectOptions(screen.getByLabelText("Donor ranking"), "COMBINED");
  await screen.findByRole("heading", { name: "Previous matches requiring review" });
  expect(within(screen.getAllByRole("article")[0]).getByRole("heading")).toHaveTextContent("Higher propensity");
  expect(screen.getByText(/This heuristic is not clinically validated/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Nearby candidates (3)" })).toBeInTheDocument();
});
it("nearest full-precision order survives displayed distance ties", async () => {
  renderAt();
  ml.getPredictions.mockResolvedValue(predictions([{ ...high, distance_km: 1.23 }, { ...near, distance_km: 1.23 }, fresh]));
  await analyze(); await screen.findByText("82.4%");
  expect(within(screen.getAllByRole("article")[0]).getByRole("heading")).toHaveTextContent("Higher propensity");
});
it("zero is a valid scored probability", async () => {
  ml.getPredictions.mockResolvedValue(predictions([{ ...near, donation_probability: 0 }]));
  renderAt(); await analyze(); expect(await screen.findByText("0.0%")).toBeInTheDocument();
});
it("prevents repeated analysis while loading", async () => {
  let finish;
  ml.getPredictions.mockImplementation(() => new Promise(resolve => { finish = () => resolve(predictions([near])); }));
  renderAt();
  const button = await screen.findByRole("button", { name: "Analyze Donation Propensity" });
  await userEvent.dblClick(button);
  expect(ml.getPredictions).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  expect(screen.getByLabelText("Selected radius")).toBeDisabled();
  finish(); await waitFor(() => expect(button).not.toBeDisabled());
});
it("model unavailable keeps matched donors and null scores", async () => {
  ml.getPredictions.mockResolvedValue({ ...predictions([{ ...near, prediction_available: false, donation_probability: null, unavailable_reason: "MODEL_FILE_MISSING" }, fresh]), model_available: false });
  renderAt(); await analyze();
  expect(await screen.findByText(/Random Forest model unavailable/)).toBeInTheDocument();
  expect(screen.getByText("Model Unavailable")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "New donor" })).toBeInTheDocument();
  expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
});
it("prediction errors retain matching and allow retry", async () => {
  ml.getPredictions.mockRejectedValue({ response: { status: 403, data: { detail: "Access denied." } } });
  renderAt(); await analyze();
  expect(await screen.findByText("Access denied.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Near donor" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Analyze Donation Propensity" })).not.toBeDisabled();
});
it("regeneration invalidates old scores and preserves match statuses", async () => {
  renderAt(); await analyze(); await screen.findByText("82.4%");
  await userEvent.click(screen.getByRole("button", { name: "Find Nearby Donors" }));
  await waitFor(() => expect(matching.generateMatches).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("82.4%")).not.toBeInTheDocument();
  expect(screen.getAllByText("IDENTIFIED")).toHaveLength(3);
  expect(ml.getPredictions).toHaveBeenCalledTimes(1);
});
it("radius changes invalidate analysis rather than showing stale percentages", async () => {
  renderAt(); await analyze(); await screen.findByText("82.4%");
  await userEvent.selectOptions(screen.getByLabelText("Selected radius"), "50");
  await waitFor(() => expect(matching.getMatches).toHaveBeenLastCalledWith("7", 50));
  expect(screen.queryByText("82.4%")).not.toBeInTheDocument();
  await analyze();
  await waitFor(() => expect(ml.getPredictions).toHaveBeenLastCalledWith("7", { radius_km: 50, ranking: "NEAREST" }));
});
it("unverified hospitals cannot access analysis", async () => {
  profileService.fetchHospitalProfile.mockResolvedValue({ is_verified: false });
  renderAt(); await screen.findByText("Verification Pending");
  expect(ml.getPredictions).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Analyze Donation Propensity" })).not.toBeInTheDocument();
});
it("donors cannot access hospital analysis", async () => {
  auth.user = { role: "DONOR" };
  renderAt(); await screen.findByRole("heading", { name: /don.t have access/i });
  expect(ml.getPredictions).not.toHaveBeenCalled();
});
it("no stored matches disables analysis", async () => {
  matching.getMatches.mockResolvedValue({ ...base, matches: [] });
  renderAt(); expect(await screen.findByRole("button", { name: "Analyze Donation Propensity" })).toBeDisabled();
  expect(ml.getPredictions).not.toHaveBeenCalled();
});
it("gives ranking and radius controls concise accessible names", async () => {
  renderAt(); await screen.findByRole("heading", { name: "Near donor" });
  expect(screen.getByRole("combobox", { name: "Selected radius", exact: true })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Donor ranking", exact: true })).toBeInTheDocument();
});

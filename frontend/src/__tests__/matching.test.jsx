import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as notifications from "../services/notificationService";
import App from "../App";
import * as matching from "../services/matchingService";
import * as profileService from "../services/profileService";
import * as emergency from "../services/emergencyRequestService";

vi.mock("../services/notificationService", () => ({ getResponseSummary: vi.fn(), getDonorRequests: vi.fn(), getWhatsAppLink: vi.fn(), markContacted: vi.fn(), respondToMatch: vi.fn() }));
vi.mock("../services/donationService", () => ({ getDonationProgress: vi.fn().mockResolvedValue({ request_id: 7, request_status: "OPEN", completed_units: 0, units_required: 2, remaining_units: 2, can_fulfill: false }), fulfillRequest: vi.fn(), completeDonation: vi.fn(), getDonorHistory: vi.fn(), getHospitalHistory: vi.fn() }));
vi.mock("../services/screeningService", () => ({ getScreeningSummary: vi.fn().mockResolvedValue({ screening_pending: 0, approved_donors: 0, completed_donations: 0 }), getScreening: vi.fn(), markArrived: vi.fn(), startScreening: vi.fn(), recordDecision: vi.fn(), getScreeningQueue: vi.fn() }));
const auth = { user: null, status: "authenticated", logout: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../services/profileService", () => ({ fetchHospitalProfile: vi.fn(), fetchDonorProfile: vi.fn(), updateHospitalProfile: vi.fn(), updateDonorProfile: vi.fn() }));
vi.mock("../services/matchingService", () => ({ getMatches: vi.fn(), generateMatches: vi.fn() }));
vi.mock("../services/emergencyRequestService", () => ({ getRequest: vi.fn(), listRequests: vi.fn(), getSummary: vi.fn(), createRequest: vi.fn(), updateRequest: vi.fn(), cancelRequest: vi.fn() }));
vi.mock("../components/BackendStatus", () => ({ default: () => null }));
const hospital = { hospital_id: 1, is_verified: true, is_active: true, hospital_name: "Test Hospital" };
const row = (id, name, distance) => ({ match_id: id, donor_name: name, blood_group: "O-", distance_km: distance,
  eligible_for_contact: true, system_eligible: true, screening_required: true, prescreening_outcome: "REVIEW_REQUIRED",
  match_status: "IDENTIFIED", warnings: ["Hospital screening is required."] });
const result = (overrides = {}) => ({ request_id: 7, required_blood_group: "O+", units_required: 2, urgency: "CRITICAL",
  request_status: "OPEN", radius_km: 25, matches: [], total_matches: 0, review_candidates: [], ...overrides });
function renderAt(path = "/hospital/emergency/7/matches") {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  notifications.getResponseSummary.mockResolvedValue({ request_id: 7, matches: [], total_matched: 0, awaiting_response: 0, available: 0, not_available: 0, contacted: 0 });
  notifications.getDonorRequests.mockResolvedValue({ pending_count: 0, active_requests: [], historical_requests: [] });
  auth.user = { role: "HOSPITAL", email: "hospital@example.com" };
  profileService.fetchHospitalProfile.mockResolvedValue(hospital);
  matching.getMatches.mockResolvedValue(result());
  matching.generateMatches.mockResolvedValue(result({ request_status: "MATCHING", matches: [row(1, "Near donor", 1.2)], total_matches: 1 }));
  emergency.getRequest.mockResolvedValue({ request_id: 7, status: "OPEN", required_blood_group: "O+", units_required: 2 });
});

describe("hospital donor matching", () => {
  it("loads stored matches and shows the request and safety context", async () => {
    renderAt();
    await screen.findByRole("button", { name: "Find Nearby Donors" });
    expect(matching.getMatches).toHaveBeenCalledWith("7", 25);
    expect(screen.getByText("O+")).toBeInTheDocument();
    expect(screen.getByText("Final donor eligibility is subject to hospital medical screening.")).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d%/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contact via WhatsApp" })).not.toBeInTheDocument();
  });
  it("changes radius and generates through the correct service", async () => {
    renderAt();
    await screen.findByLabelText("Selected radius");
    await userEvent.selectOptions(screen.getByLabelText("Selected radius"), "50");
    await waitFor(() => expect(matching.getMatches).toHaveBeenLastCalledWith("7", 50));
    await userEvent.click(await screen.findByRole("button", { name: "Find Nearby Donors" }));
    await screen.findByRole("heading", { name: "Near donor" });
    expect(matching.generateMatches).toHaveBeenCalledWith("7", 50);
    expect(screen.getByText("IDENTIFIED")).toBeInTheDocument();
    expect(screen.getByText("1.20 km")).toBeInTheDocument();
  });
  it("sorts nearest first and retains blood labels", async () => {
    matching.getMatches.mockResolvedValue(result({ matches: [row(2, "Far donor", 9), row(1, "Near donor", 1)] }));
    renderAt();
    await screen.findByRole("heading", { name: "Near donor" });
    const cards = screen.getAllByRole("article");
    expect(within(cards[0]).getByRole("heading")).toHaveTextContent("Near donor");
    expect(within(cards[1]).getByRole("heading")).toHaveTextContent("Far donor");
    expect(within(cards[0]).getByText("O-")).toBeInTheDocument();
  });
  it("preserves backend full-precision order when displayed distances tie", async () => {
    matching.getMatches.mockResolvedValue(result({ matches: [row(9, "Closer before rounding", 1.23), row(1, "Further before rounding", 1.23)] }));
    renderAt();
    await screen.findByRole("heading", { name: "Closer before rounding" });
    expect(within(screen.getAllByRole("article")[0]).getByRole("heading")).toHaveTextContent("Closer before rounding");
  });
  it("prevents double generation while loading", async () => {
    let finish;
    matching.generateMatches.mockImplementation(() => new Promise(resolve => { finish = () => resolve(result()); }));
    renderAt();
    const button = await screen.findByRole("button", { name: "Find Nearby Donors" });
    await userEvent.dblClick(button);
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("Selected radius")).toBeDisabled();
    expect(matching.generateMatches).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
  it("repeated generation replaces results without duplicate cards", async () => {
    renderAt();
    const button = await screen.findByRole("button", { name: "Find Nearby Donors" });
    await userEvent.click(button);
    await screen.findByRole("heading", { name: "Near donor" });
    await userEvent.click(button);
    await waitFor(() => expect(matching.generateMatches).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole("heading", { name: "Near donor" })).toHaveLength(1);
  });
  it("shows helpful empty results", async () => {
    matching.generateMatches.mockResolvedValue(result({ message: "No contactable donors found. Try a larger radius." }));
    renderAt();
    await userEvent.click(await screen.findByRole("button", { name: "Find Nearby Donors" }));
    expect(await screen.findByText("No contactable donors found. Try a larger radius.")).toBeInTheDocument();
  });
  it("handles generation errors and permits retry", async () => {
    matching.generateMatches.mockRejectedValue({ response: { status: 400, data: { radius_km: ["Invalid radius."] } } });
    renderAt();
    const button = await screen.findByRole("button", { name: "Find Nearby Donors" });
    await userEvent.click(button);
    expect(await screen.findByText("Invalid radius.")).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });
  it("handles fetch errors", async () => {
    matching.getMatches.mockRejectedValue({ response: { status: 404, data: { detail: "Not found." } } });
    renderAt();
    expect(await screen.findByText("Not found.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Find Nearby Donors" })).not.toBeInTheDocument();
  });
  it("keeps historical records separate from current recommendations", async () => {
    matching.getMatches.mockResolvedValue(result({ matches: [{ ...row(1, "Historical donor", 30), eligible_for_contact: false,
      current_issues: ["Outside radius."] }] }));
    renderAt();
    await screen.findByRole("heading", { name: "Previous matches requiring review" });
    expect(screen.getByRole("heading", { name: "Nearby candidates (0)" })).toBeInTheDocument();
    expect(screen.getByText("Outside radius.")).toBeInTheDocument();
  });
  it("shows review candidates without claiming match status or clearance", async () => {
    matching.generateMatches.mockResolvedValue(result({ review_candidates: [{ ...row(null, "Review donor", 1),
      eligible_for_contact: false, match_status: null }] }));
    renderAt();
    await userEvent.click(await screen.findByRole("button", { name: "Find Nearby Donors" }));
    await screen.findByRole("heading", { name: "Hospital review required" });
    expect(screen.getByText("Review required — no match record")).toBeInTheDocument();
  });
  it.each(["CANCELLED", "CLOSED", "FULFILLED", "DONORS_CONTACTED"])("disables generation for %s", async (status) => {
    matching.getMatches.mockResolvedValue(result({ request_status: status }));
    renderAt();
    expect(await screen.findByRole("button", { name: "Find Nearby Donors" })).toBeDisabled();
    expect(matching.generateMatches).not.toHaveBeenCalled();
  });
  it("blocks unverified hospitals without matching API calls", async () => {
    profileService.fetchHospitalProfile.mockResolvedValue({ ...hospital, is_verified: false });
    renderAt();
    await screen.findByText("Verification Pending");
    expect(matching.getMatches).not.toHaveBeenCalled();
  });
  it("blocks donors from the hospital route", async () => {
    auth.user = { role: "DONOR" };
    renderAt();
    expect(await screen.findByRole("heading", { name: /don.t have access/i })).toBeInTheDocument();
    expect(matching.getMatches).not.toHaveBeenCalled();
  });
  it.each(["OPEN", "MATCHING"])("shows details navigation for %s", async (status) => {
    emergency.getRequest.mockResolvedValue({ request_id: 7, status, required_blood_group: "O+", units_required: 2 });
    renderAt("/hospital/emergency/7");
    expect(await screen.findByRole("link", { name: "Find Matching Donors" })).toHaveAttribute("href", "/hospital/emergency/7/matches");
  });
  it("retains recommendation navigation after contact starts", async () => {
    emergency.getRequest.mockResolvedValue({ request_id: 7, status: "DONORS_CONTACTED" });
    renderAt("/hospital/emergency/7");
    expect(await screen.findByRole("link", { name: "View Donor Matches" })).toHaveAttribute("href", "/hospital/emergency/7/matches");
  });
  it("hides matching navigation for cancelled requests", async () => {
    emergency.getRequest.mockResolvedValue({ request_id: 7, status: "CANCELLED" });
    renderAt("/hospital/emergency/7");
    await screen.findByRole("heading", { name: "Request #7" });
    expect(screen.queryByRole("link", { name: "Find Matching Donors" })).not.toBeInTheDocument();
  });
});

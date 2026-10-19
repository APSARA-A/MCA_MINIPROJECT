import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import * as profiles from "../services/profileService";
import * as matching from "../services/matchingService";
import * as ml from "../services/mlPredictionService";
import * as notify from "../services/notificationService";
vi.mock("../services/donationService", () => ({ getDonationProgress: vi.fn().mockResolvedValue({ request_id: 7, request_status: "OPEN", completed_units: 0, units_required: 2, remaining_units: 2, can_fulfill: false }), fulfillRequest: vi.fn(), completeDonation: vi.fn(), getDonorHistory: vi.fn(), getHospitalHistory: vi.fn() }));
vi.mock("../services/screeningService", () => ({ getScreeningSummary: vi.fn().mockResolvedValue({ screening_pending: 0, approved_donors: 0, completed_donations: 0 }), getScreening: vi.fn(), markArrived: vi.fn(), startScreening: vi.fn(), recordDecision: vi.fn(), getScreeningQueue: vi.fn() }));
const auth = { user: { role: "HOSPITAL" }, status: "authenticated", logout: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../components/BackendStatus", () => ({ default: () => null }));
vi.mock("../services/profileService", () => ({ fetchHospitalProfile: vi.fn(), fetchDonorProfile: vi.fn(), updateDonorProfile: vi.fn(), updateHospitalProfile: vi.fn() }));
vi.mock("../services/matchingService", () => ({ getMatches: vi.fn(), generateMatches: vi.fn() }));
vi.mock("../services/mlPredictionService", () => ({ getPredictions: vi.fn() }));
vi.mock("../services/notificationService", () => ({ getWhatsAppLink: vi.fn(), markContacted: vi.fn(), respondToMatch: vi.fn(), getDonorRequests: vi.fn(), getResponseSummary: vi.fn() }));
const row = { match_id: 3, donor_name: "Asha", blood_group: "O-", distance_km: 2, eligible_for_contact: true, system_eligible: true, match_status: "IDENTIFIED", donor_response: "PENDING", notification_status: "PENDING" };
const matchingResult = { request_id: 7, request_status: "MATCHING", required_blood_group: "O+", units_required: 2, urgency: "CRITICAL", matches: [row] };
const summary = { request_id: 7, request_status: "MATCHING", total_matched: 1, awaiting_response: 1, available: 0, not_available: 0, contacted: 0, matches: [row] };
const donorRow = { ...row, hospital_name: "City Hospital", request_id: 7, request_status: "DONORS_CONTACTED", required_blood_group: "O+", urgency: "CRITICAL", request_created_at: "2026-10-11T10:00:00Z", can_respond: true };
const donorData = { pending_count: 1, active_requests: [donorRow], historical_requests: [] };
const url = "https://wa.me/919876543210?text=LifeLink";
function renderAt(path = "/hospital/emergency/7/matches") { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
async function confirm() {
  await userEvent.click(await screen.findByRole("button", { name: "Confirm Contact Attempt" }));
  await userEvent.click(screen.getByRole("button", { name: "Yes, contact was attempted" }));
}
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { role: "HOSPITAL" };
  profiles.fetchHospitalProfile.mockResolvedValue({ is_verified: true, is_active: true });
  profiles.fetchDonorProfile.mockResolvedValue({ full_name: "Asha", is_active: true, blood_group: "O+", created_at: "2026-10-01", date_of_birth: "2000-01-01" });
  matching.getMatches.mockResolvedValue(matchingResult); matching.generateMatches.mockResolvedValue(matchingResult);
  ml.getPredictions.mockResolvedValue({ model_available: true, predictions: [{ ...row, prediction_available: true, donation_probability: .824 }], reference_date: "2026-10-11" });
  notify.getResponseSummary.mockResolvedValue(summary); notify.getDonorRequests.mockResolvedValue(donorData);
  notify.getWhatsAppLink.mockResolvedValue({ whatsapp_url: url, message: "LifeLink" });
  notify.markContacted.mockResolvedValue({ ...row, request_status: "DONORS_CONTACTED", match_status: "CONTACTED" });
  vi.spyOn(window, "open").mockReturnValue(null);
});
afterEach(() => vi.restoreAllMocks());
it("opens the authorized link safely without confirming contact or changing status", async () => {
  renderAt(); await userEvent.click(await screen.findByRole("button", { name: "Contact via WhatsApp" }));
  await waitFor(() => expect(window.open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer"));
  expect(notify.markContacted).not.toHaveBeenCalled(); expect(matching.generateMatches).not.toHaveBeenCalled();
  expect(screen.getByText(/You must manually send it/)).toBeInTheDocument();
  expect(screen.getByText("IDENTIFIED")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open prepared WhatsApp message" })).toHaveAttribute("rel", "noopener noreferrer");
});
it("rejects unexpected external navigation URLs", async () => {
  notify.getWhatsAppLink.mockResolvedValue({ whatsapp_url: "https://evil.example/123" });
  renderAt(); await userEvent.click(await screen.findByRole("button", { name: "Contact via WhatsApp" }));
  await screen.findByRole("alert"); expect(window.open).not.toHaveBeenCalled();
});
it("shows missing phone errors without opening a link", async () => {
  notify.getWhatsAppLink.mockRejectedValue({ response: { status: 400, data: { detail: "No valid phone number." } } });
  renderAt(); await userEvent.click(await screen.findByRole("button", { name: "Contact via WhatsApp" }));
  expect(await screen.findByText("No valid phone number.")).toBeInTheDocument(); expect(window.open).not.toHaveBeenCalled();
});
it("requires a separate confirmation and allows cancellation", async () => {
  renderAt(); await userEvent.click(await screen.findByRole("button", { name: "Confirm Contact Attempt" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument(); expect(notify.markContacted).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
it("confirmation updates contact status and summary while preserving ML scores", async () => {
  renderAt(); await userEvent.click(await screen.findByRole("button", { name: "Analyze Donation Propensity" }));
  await screen.findByText("82.4%");
  notify.getResponseSummary.mockResolvedValue({ ...summary, request_status: "DONORS_CONTACTED", contacted: 1, matches: [{ ...row, match_status: "CONTACTED" }] });
  await confirm(); await screen.findByText("CONTACTED");
  expect(screen.getByText("82.4%")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Find Nearby Donors" })).toBeDisabled();
  expect(matching.generateMatches).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Confirm Contact Attempt" })).not.toBeInTheDocument();
  expect(notify.markContacted).toHaveBeenCalledWith(3);
});
it("contact errors retain status and permit retry", async () => {
  notify.markContacted.mockRejectedValue({ response: { status: 409, data: { detail: "Request closed." } } });
  renderAt(); await confirm(); expect(await screen.findByText("Request closed.")).toBeInTheDocument();
  expect(screen.getByText("IDENTIFIED")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Yes, contact was attempted" })).not.toBeDisabled();
});
it("double clicks do not submit duplicate confirmations", async () => {
  let finish; notify.markContacted.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ...row, match_status: "CONTACTED", request_status: "DONORS_CONTACTED" }); }));
  renderAt(); await userEvent.click(await screen.findByRole("button", { name: "Confirm Contact Attempt" }));
  await userEvent.dblClick(screen.getByRole("button", { name: "Yes, contact was attempted" }));
  expect(notify.markContacted).toHaveBeenCalledTimes(1); finish(); await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
});
it.each(["CANCELLED", "FULFILLED", "CLOSED"])("hides contact actions for %s", async state => {
  matching.getMatches.mockResolvedValue({ ...matchingResult, request_status: state });
  notify.getResponseSummary.mockResolvedValue({ ...summary, request_status: state });
  renderAt(); await screen.findByRole("heading", { name: "Asha" });
  expect(screen.queryByRole("button", { name: "Contact via WhatsApp" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirm Contact Attempt" })).not.toBeInTheDocument();
});
it("shows donor responses on refresh and retains RF prediction/ranking controls", async () => {
  renderAt(); await screen.findByRole("heading", { name: "Asha" });
  notify.getResponseSummary.mockResolvedValue({ ...summary, available: 1, awaiting_response: 0, matches: [{ ...row, match_status: "AVAILABLE", donor_response: "AVAILABLE" }] });
  await userEvent.click(screen.getByRole("button", { name: "Refresh Responses" }));
  await screen.findAllByText("AVAILABLE"); expect(screen.getByText(/Donor Available/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Analyze Donation Propensity" }));
  expect(await screen.findByText("82.4%")).toBeInTheDocument(); expect(screen.getByLabelText("Donor ranking")).toBeInTheDocument();
});
it("unverified hospitals and wrong roles never reach notifications", async () => {
  profiles.fetchHospitalProfile.mockResolvedValue({ is_verified: false }); renderAt();
  await screen.findByText("Verification Pending"); expect(notify.getResponseSummary).not.toHaveBeenCalled();
});
it("donor page loads only API rows and submits AVAILABLE with no donor id", async () => {
  auth.user = { role: "DONOR" }; renderAt("/donor/requests");
  await screen.findByRole("heading", { name: "City Hospital" });
  notify.respondToMatch.mockResolvedValue({ ...donorRow, donor_response: "AVAILABLE", match_status: "AVAILABLE" });
  notify.getDonorRequests.mockResolvedValue({ ...donorData, pending_count: 0, active_requests: [{ ...donorRow, donor_response: "AVAILABLE", match_status: "AVAILABLE" }] });
  await userEvent.click(screen.getByRole("button", { name: "I'm Available" }));
  await screen.findByText("Your availability response has been saved.");
  expect(notify.respondToMatch).toHaveBeenCalledWith(3, "AVAILABLE");
  expect(screen.getByRole("button", { name: "I'm Available" })).toBeDisabled();
  expect(screen.getByText("Donor Available")).toBeInTheDocument();
});
it("donor can change AVAILABLE to NOT_AVAILABLE before screening", async () => {
  auth.user = { role: "DONOR" };
  notify.getDonorRequests.mockResolvedValue({ ...donorData, active_requests: [{ ...donorRow, donor_response: "AVAILABLE", match_status: "AVAILABLE" }] });
  renderAt("/donor/requests"); await screen.findByRole("heading", { name: "City Hospital" });
  notify.respondToMatch.mockResolvedValue({ ...donorRow, donor_response: "NOT_AVAILABLE", match_status: "UNAVAILABLE" });
  notify.getDonorRequests.mockResolvedValue({ ...donorData, active_requests: [{ ...donorRow, donor_response: "NOT_AVAILABLE", match_status: "UNAVAILABLE" }] });
  await userEvent.click(screen.getByRole("button", { name: "Not Available" }));
  await screen.findByText("Donor Not Available"); expect(notify.respondToMatch).toHaveBeenCalledWith(3,"NOT_AVAILABLE");
});
it("donor response double clicks are blocked", async () => {
  auth.user = { role: "DONOR" }; let finish;
  notify.respondToMatch.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ...donorRow, donor_response: "AVAILABLE" }); }));
  renderAt("/donor/requests"); await userEvent.dblClick(await screen.findByRole("button", { name: "I'm Available" }));
  expect(notify.respondToMatch).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Not Available" })).toBeDisabled();
  finish(); await screen.findByText("Your availability response has been saved.");
});
it("historical and screening matches have no response buttons", async () => {
  auth.user = { role: "DONOR" }; notify.getDonorRequests.mockResolvedValue({ pending_count: 0,
    active_requests: [{ ...donorRow, match_status: "SCREENING", can_respond: false }],
    historical_requests: [{ ...donorRow, match_id: 4, hospital_name: "Past Hospital", request_status: "CANCELLED", can_respond: false }] });
  renderAt("/donor/requests"); await screen.findByRole("heading", { name: "Past Hospital" });
  expect(screen.queryByRole("button", { name: "I'm Available" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Historical Requests" })).toBeInTheDocument();
});
it("rejected donor response displays backend conflict", async () => {
  auth.user = { role: "DONOR" }; notify.respondToMatch.mockRejectedValue({ response: { status: 409, data: { detail: "Request no longer active." } } });
  renderAt("/donor/requests"); await userEvent.click(await screen.findByRole("button", { name: "I'm Available" }));
  expect(await screen.findByText("Request no longer active.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "I'm Available" })).not.toBeDisabled();
});
it("empty/error donor states can be refreshed", async () => {
  auth.user = { role: "DONOR" }; notify.getDonorRequests.mockRejectedValueOnce({ response: { status: 403, data: { detail: "Access denied." } } });
  renderAt("/donor/requests"); await screen.findByText("Access denied.");
  notify.getDonorRequests.mockResolvedValue({ pending_count: 0, active_requests: [], historical_requests: [] });
  await userEvent.click(screen.getByRole("button", { name: "Refresh Requests" })); expect(await screen.findByText("No active matched blood requests.")).toBeInTheDocument();
});
it("hospital cannot access donor response page", async () => {
  renderAt("/donor/requests"); await screen.findByRole("heading", { name: /don.t have access/ }); expect(notify.getDonorRequests).not.toHaveBeenCalled();
});
it("dashboard shows real pending count and active navigation", async () => {
  auth.user = { role: "DONOR" }; renderAt("/donor/dashboard");
  expect(await screen.findByText("1 matched request awaiting your response.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View Blood Requests" })).toHaveAttribute("href", "/donor/requests");
});
it("summary refreshes when the hospital window regains focus", async () => {
  renderAt(); await screen.findByRole("heading", { name: "Donor responses" });
  const calls = notify.getResponseSummary.mock.calls.length;
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(notify.getResponseSummary.mock.calls.length).toBeGreaterThan(calls));
  expect(within(screen.getByRole("region", { name: "Donor responses" })).getByText("Total Matched")).toBeInTheDocument();
});
it("a conflicting donor response refreshes lifecycle state and removes response actions", async () => {
  auth.user = { role: "DONOR" };
  renderAt("/donor/requests"); await screen.findByRole("heading", { name: "City Hospital" });
  notify.respondToMatch.mockRejectedValue({ response: { status: 409, data: { detail: "Request no longer active." } } });
  notify.getDonorRequests.mockResolvedValue({ pending_count: 0, active_requests: [], historical_requests: [{ ...donorRow, request_status: "CANCELLED", can_respond: false }] });
  await userEvent.click(screen.getByRole("button", { name: "I'm Available" }));
  await screen.findByRole("heading", { name: "Historical Requests" });
  expect(screen.getByText("Request no longer active.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "I'm Available" })).not.toBeInTheDocument();
});
it("refreshing a changed response restores a now-available donor to current recommendations", async () => {
  const old = { ...row, match_status: "UNAVAILABLE", donor_response: "NOT_AVAILABLE", eligible_for_contact: false, current_issues: ["Stored workflow decision excludes this match from current recommendations."] };
  matching.getMatches.mockResolvedValue({ ...matchingResult, matches: [old] });
  notify.getResponseSummary.mockResolvedValue({ ...summary, matches: [old], not_available: 1, awaiting_response: 0 });
  renderAt(); await screen.findByRole("heading", { name: "Previous matches requiring review" });
  matching.getMatches.mockResolvedValue({ ...matchingResult, matches: [{ ...row, match_status: "AVAILABLE", donor_response: "AVAILABLE" }] });
  notify.getResponseSummary.mockResolvedValue({ ...summary, matches: [{ ...row, match_status: "AVAILABLE", donor_response: "AVAILABLE" }], available: 1, awaiting_response: 0 });
  await userEvent.click(screen.getByRole("button", { name: "Refresh Responses" }));
  await screen.findByRole("heading", { name: "Nearby candidates (1)" });
  expect(screen.queryByRole("heading", { name: "Previous matches requiring review" })).not.toBeInTheDocument();
  expect(matching.generateMatches).not.toHaveBeenCalled();
});

it("previews synthetic demo messages without opening WhatsApp or providing a send link", async () => {
  notify.getWhatsAppLink.mockResolvedValue({ whatsapp_url: url, message: "SYNTHETIC demo message", demo_only: true });
  renderAt();
  await userEvent.click(await screen.findByRole("button", { name: "Contact via WhatsApp" }));
  expect(await screen.findByText("SYNTHETIC demo message")).toBeInTheDocument();
  expect(window.open).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: "Open prepared WhatsApp message" })).not.toBeInTheDocument();
});

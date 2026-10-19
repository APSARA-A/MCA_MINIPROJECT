import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import * as emergency from "../services/emergencyRequestService";
import * as profileService from "../services/profileService";

vi.mock("../services/donationService", () => ({ getDonationProgress: vi.fn().mockResolvedValue({ request_id: 7, request_status: "OPEN", completed_units: 0, units_required: 2, remaining_units: 2, can_fulfill: false }), fulfillRequest: vi.fn(), completeDonation: vi.fn(), getDonorHistory: vi.fn(), getHospitalHistory: vi.fn() }));
vi.mock("../services/screeningService", () => ({ getScreeningSummary: vi.fn().mockResolvedValue({ screening_pending: 0, approved_donors: 0, completed_donations: 0 }), getScreening: vi.fn(), markArrived: vi.fn(), startScreening: vi.fn(), recordDecision: vi.fn(), getScreeningQueue: vi.fn() }));
const auth = { user: null, status: "anonymous", login: vi.fn(), logout: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth, AuthProvider: ({ children }) => children }));
vi.mock("../components/BackendStatus", () => ({ default: () => <p>Backend status</p> }));
vi.mock("../services/profileService", () => ({
  fetchDonorProfile: vi.fn(), updateDonorProfile: vi.fn(), fetchHospitalProfile: vi.fn(), updateHospitalProfile: vi.fn(),
}));
vi.mock("../services/emergencyRequestService", () => ({
  listRequests: vi.fn(), getRequest: vi.fn(), createRequest: vi.fn(), updateRequest: vi.fn(),
  cancelRequest: vi.fn(), getSummary: vi.fn(),
}));

const hospital = {
  hospital_id: 1, hospital_name: "City Care Hospital", registration_number: "REG-100", phone_number: "4841234567",
  email: "city@example.com", address: "MG Road", latitude: "9.9312328", longitude: "76.2673041", is_verified: true,
  verification_status: "VERIFIED", is_active: true, has_location: true, created_at: "2026-09-02T10:00:00Z", updated_at: "2026-09-02T10:00:00Z",
};
const pending = { ...hospital, is_verified: false, verification_status: "PENDING" };

const row = (over = {}) => ({
  request_id: 7, required_blood_group: "O+", units_required: 2, urgency: "CRITICAL", status: "OPEN", status_display: "Open",
  created_at: "2026-10-01T08:30:00Z", is_editable: true, is_cancellable: true, ...over,
});
const detail = (over = {}) => ({
  ...row(), hospital_name: "City Care Hospital", patient_reference: "CASE-001", latitude: "9.9312328", longitude: "76.2673041",
  updated_at: "2026-10-01T08:30:00Z", ...over,
});
const page = (results) => ({ count: results.length, next: null, previous: null, results });

function renderAt(path) {
  auth.user = { id: 1, email: "city@example.com", role: "HOSPITAL" };
  auth.status = "authenticated";
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

function mockGeolocation(impl) {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: vi.fn(impl) } });
}

beforeEach(() => {
  vi.clearAllMocks();
  profileService.fetchHospitalProfile.mockResolvedValue(hospital);
  emergency.getSummary.mockResolvedValue({ total_requests: 5, open_requests: 2, critical_requests: 1 });
  emergency.listRequests.mockResolvedValue(page([row()]));
  emergency.getRequest.mockResolvedValue(detail());
});
afterEach(() => delete navigator.geolocation);

describe("hospital dashboard integration", () => {
  it("shows enabled create/view links and real counts for a verified hospital", async () => {
    renderAt("/hospital/dashboard");
    expect(await screen.findByRole("link", { name: "Create Emergency Request" })).toHaveAttribute("href", "/hospital/emergency/new");
    expect(screen.getByRole("link", { name: "View Emergency Requests" })).toHaveAttribute("href", "/hospital/emergency");
    expect(await screen.findByText("Total requests")).toBeInTheDocument();
    const counts = screen.getByText("Total requests").closest("dl");
    expect(within(counts).getByText("5")).toBeInTheDocument();
    expect(within(counts).getByText("2")).toBeInTheDocument();
    expect(within(counts).getByText("1")).toBeInTheDocument();
    expect(emergency.getSummary).toHaveBeenCalledTimes(1);
  });

  it("shows zero when the database has no requests (no invented numbers)", async () => {
    emergency.getSummary.mockResolvedValue({ total_requests: 0, open_requests: 0, critical_requests: 0 });
    renderAt("/hospital/dashboard");
    const counts = (await screen.findByText("Total requests")).closest("dl");
    expect(within(counts).getAllByText("0")).toHaveLength(3);
  });

  it("locks everything for an unverified hospital and makes no request API calls", async () => {
    profileService.fetchHospitalProfile.mockResolvedValue(pending);
    renderAt("/hospital/dashboard");
    expect(await screen.findByText("Verification Pending")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create Emergency Request" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Emergency Request" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "View Emergency Requests" })).toBeDisabled();
    expect(screen.getByText(/Emergency requests unlock once an administrator verifies/i)).toBeInTheDocument();
    expect(emergency.getSummary).not.toHaveBeenCalled();
    const sidebar = screen.getByRole("navigation", { name: "Hospital navigation" });
    expect(within(sidebar).queryByRole("link", { name: "Create Request" })).not.toBeInTheDocument();
    expect(within(sidebar).getByText("Create Request").closest("[aria-disabled='true']")).toBeInTheDocument();
  });

  it("lists the new sidebar items as links for a verified hospital", async () => {
    renderAt("/hospital/dashboard");
    await screen.findByRole("heading", { name: "City Care Hospital" });
    const sidebar = screen.getByRole("navigation", { name: "Hospital navigation" });
    expect(within(sidebar).getByRole("link", { name: "Emergency Requests" })).toHaveAttribute("href", "/hospital/emergency");
    expect(within(sidebar).getByRole("link", { name: "Create Request" })).toHaveAttribute("href", "/hospital/emergency/new");
    expect(within(sidebar).getByRole("link", { name: "Donor Matches" })).toHaveAttribute("href", "/hospital/emergency");
  });
});

describe("route protection", () => {
  it("shows a verification notice instead of the pages for an unverified hospital", async () => {
    profileService.fetchHospitalProfile.mockResolvedValue(pending);
    for (const path of ["/hospital/emergency", "/hospital/emergency/new", "/hospital/emergency/7", "/hospital/emergency/7/edit"]) {
      const { unmount } = renderAt(path);
      expect(await screen.findByRole("heading", { name: "Emergency requests are locked" })).toBeInTheDocument();
      unmount();
    }
    expect(emergency.listRequests).not.toHaveBeenCalled();
    expect(emergency.getRequest).not.toHaveBeenCalled();
  });

  it("blocks donors and anonymous visitors", () => {
    auth.user = { id: 2, email: "d@example.com", role: "DONOR" };
    const { unmount } = render(<MemoryRouter initialEntries={["/hospital/emergency/new"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /don't have access/i })).toBeInTheDocument();
    unmount();
    auth.user = null;
    render(<MemoryRouter initialEntries={["/hospital/emergency"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("create request form", () => {
  const fill = async (group = "O+", units = "2") => {
    await userEvent.selectOptions(screen.getByLabelText(/required blood group/i), group);
    const u = screen.getByLabelText(/units required/i);
    await userEvent.clear(u);
    await userEvent.type(u, units);
  };

  it("prefills the hospital's saved coordinates", async () => {
    renderAt("/hospital/emergency/new");
    expect(await screen.findByText("Your hospital's saved location")).toBeInTheDocument();
    expect(screen.getByText("9.931233")).toBeInTheDocument();
    expect(screen.getByText("76.267304")).toBeInTheDocument();
  });

  it("offers all eight blood groups and three urgencies", async () => {
    renderAt("/hospital/emergency/new");
    const group = await screen.findByLabelText(/required blood group/i);
    expect(within(group).getAllByRole("option").map((o) => o.value)).toEqual(["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
    expect(within(screen.getByLabelText(/urgency/i)).getAllByRole("option").map((o) => o.textContent)).toEqual(["Normal", "Urgent", "Critical"]);
  });

  it("validates required fields and units before calling the API", async () => {
    renderAt("/hospital/emergency/new");
    await screen.findByLabelText(/units required/i);
    await userEvent.click(screen.getByRole("button", { name: "Submit Emergency Request" }));
    expect(screen.getByText("Select the required blood group.")).toBeInTheDocument();
    await fill("O+", "0");
    await userEvent.click(screen.getByRole("button", { name: "Submit Emergency Request" }));
    expect(screen.getByText("Enter a whole number of units between 1 and 50.")).toBeInTheDocument();
    await fill("O+", "2.5");
    await userEvent.click(screen.getByRole("button", { name: "Submit Emergency Request" }));
    expect(screen.getByText("Enter a whole number of units between 1 and 50.")).toBeInTheDocument();
    expect(emergency.createRequest).not.toHaveBeenCalled();
  });

  it("requires a location when the hospital has none and nothing is invented", async () => {
    profileService.fetchHospitalProfile.mockResolvedValue({ ...hospital, latitude: null, longitude: null, has_location: false });
    renderAt("/hospital/emergency/new");
    expect(await screen.findByText(/No location selected/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use hospital location" })).not.toBeInTheDocument();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Submit Emergency Request" }));
    expect(screen.getByText(/Set a request location/i)).toBeInTheDocument();
    expect(emergency.createRequest).not.toHaveBeenCalled();
  });

  it("captures the current location only after a click and does not touch the hospital profile", async () => {
    mockGeolocation((ok) => ok({ coords: { latitude: 10.0159, longitude: 76.3419, accuracy: 10 } }));
    emergency.createRequest.mockResolvedValue(detail());
    renderAt("/hospital/emergency/new");
    await screen.findByLabelText(/units required/i);
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Use Current Location" }));
    expect(await screen.findByText("Your current location (from this browser)")).toBeInTheDocument();
    await fill("A-", "3");
    await userEvent.click(screen.getByRole("button", { name: "Submit Emergency Request" }));

    expect(emergency.createRequest).toHaveBeenCalledWith({
      patient_reference: "", required_blood_group: "A-", units_required: 3, urgency: "NORMAL",
      latitude: "10.0159000", longitude: "76.3419000",
    });
    expect(profileService.updateHospitalProfile).not.toHaveBeenCalled();
  });

  it("keeps the hospital coordinates when location permission is denied", async () => {
    mockGeolocation((_ok, fail) => fail({ code: 1 }));
    renderAt("/hospital/emergency/new");
    await screen.findByLabelText(/units required/i);
    await userEvent.click(screen.getByRole("button", { name: "Use Current Location" }));
    expect(screen.getByText(/permission was denied/i)).toBeInTheDocument();
    expect(screen.getByText("Your hospital's saved location")).toBeInTheDocument();
  });

  it("submits once, shows the success notice on the details page and ignores double clicks", async () => {
    let finish;
    emergency.createRequest.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(detail({ request_id: 12 })); }));
    emergency.getRequest.mockResolvedValue(detail({ request_id: 12 }));
    renderAt("/hospital/emergency/new");
    await screen.findByLabelText(/units required/i);
    await fill("O+", "2");
    const submit = screen.getByRole("button", { name: "Submit Emergency Request" });
    await userEvent.dblClick(submit);
    expect(emergency.createRequest).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    finish();
    expect(await screen.findByText("Emergency request submitted.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Request #12" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find Matching Donors" })).toHaveAttribute("href", "/hospital/emergency/12/matches");
  });

  it("keeps entered values and shows server errors on failure", async () => {
    emergency.createRequest.mockRejectedValue({ response: { status: 400, data: { units_required: ["Ensure this value is less than or equal to 50."] } } });
    renderAt("/hospital/emergency/new");
    await screen.findByLabelText(/units required/i);
    await userEvent.type(screen.getByLabelText(/patient reference/i), "CASE-77");
    await fill("B+", "4");
    await userEvent.click(screen.getByRole("button", { name: "Submit Emergency Request" }));
    expect(await screen.findByText(/less than or equal to 50/)).toBeInTheDocument();
    expect(screen.getByLabelText(/patient reference/i)).toHaveValue("CASE-77");
    expect(screen.getByLabelText(/required blood group/i)).toHaveValue("B+");
    expect(screen.getByLabelText(/units required/i)).toHaveValue(4);
    expect(screen.getByRole("button", { name: "Submit Emergency Request" })).toBeEnabled();
  });
});

describe("request list", () => {
  it("shows real rows with role-aware actions and readable dates", async () => {
    emergency.listRequests.mockResolvedValue(page([
      row({ request_id: 7 }),
      row({ request_id: 8, status: "FULFILLED", status_display: "Fulfilled", is_editable: false, is_cancellable: false, urgency: "NORMAL" }),
      row({ request_id: 9, status: "MATCHING", status_display: "Matching", is_editable: false, is_cancellable: true }),
    ]));
    renderAt("/hospital/emergency");
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const open = within(rows[0]), fulfilled = within(rows[1]), matching = within(rows[2]);
    expect(open.getByRole("link", { name: "View" })).toHaveAttribute("href", "/hospital/emergency/7");
    expect(open.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/hospital/emergency/7/edit");
    expect(open.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(fulfilled.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(fulfilled.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(matching.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(matching.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(open.getByText("Open")).toBeInTheDocument();
    expect(fulfilled.getByText("Fulfilled")).toBeInTheDocument();
  });

  it("shows empty states", async () => {
    emergency.listRequests.mockResolvedValue(page([]));
    renderAt("/hospital/emergency");
    expect(await screen.findByText("No emergency requests yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first request" })).toBeInTheDocument();
  });

  it("filters by status and urgency through the API", async () => {
    renderAt("/hospital/emergency");
    await screen.findByRole("table");
    expect(emergency.listRequests).toHaveBeenLastCalledWith({ status: "", urgency: "", page: 1 });

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(emergency.listRequests).toHaveBeenLastCalledWith({ status: "OPEN", urgency: "", page: 1 }));
    expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.selectOptions(screen.getByLabelText("Urgency"), "CRITICAL");
    await waitFor(() => expect(emergency.listRequests).toHaveBeenLastCalledWith({ status: "OPEN", urgency: "CRITICAL", page: 1 }));

    emergency.listRequests.mockResolvedValue(page([]));
    await userEvent.click(screen.getByRole("button", { name: "Cancelled" }));
    expect(await screen.findByText("No requests match these filters")).toBeInTheDocument();
  });

  it("restores filters from the URL after a refresh", async () => {
    renderAt("/hospital/emergency?status=CANCELLED&urgency=URGENT&page=2");
    await screen.findByRole("table");
    expect(emergency.listRequests).toHaveBeenCalledWith({ status: "CANCELLED", urgency: "URGENT", page: 2 });
  });

  it("paginates", async () => {
    emergency.listRequests.mockResolvedValue({ count: 23, next: "x", previous: null, results: [row()] });
    renderAt("/hospital/emergency");
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(emergency.listRequests).toHaveBeenLastCalledWith({ status: "", urgency: "", page: 2 }));
  });

  it("asks for confirmation, cancels, then refreshes the list", async () => {
    emergency.cancelRequest.mockResolvedValue(detail({ status: "CANCELLED", status_display: "Cancelled", is_editable: false, is_cancellable: false }));
    renderAt("/hospital/emergency");
    await screen.findByRole("table");
    emergency.listRequests.mockResolvedValue(page([row({ status: "CANCELLED", status_display: "Cancelled", is_editable: false, is_cancellable: false })]));

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel request #7?" });
    expect(emergency.cancelRequest).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep request" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(emergency.cancelRequest).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel request" }));
    expect(emergency.cancelRequest).toHaveBeenCalledWith(7);
    expect(await screen.findByText("Request #7 was cancelled.")).toBeInTheDocument();
    expect(await screen.findByText("Cancelled", { selector: ".badge" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });
});

describe("request details and editing", () => {
  it("shows the request's real data", async () => {
    renderAt("/hospital/emergency/7");
    expect(await screen.findByRole("heading", { name: "Request #7" })).toBeInTheDocument();
    for (const text of ["City Care Hospital", "CASE-001", "9.931233, 76.267304", "O+"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/hospital/emergency/7/edit");
    expect(screen.getByRole("button", { name: "Cancel Request" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Requests" })).toHaveAttribute("href", "/hospital/emergency");
  });

  it("hides edit and cancel for finished requests", async () => {
    emergency.getRequest.mockResolvedValue(detail({ status: "FULFILLED", status_display: "Fulfilled", is_editable: false, is_cancellable: false }));
    renderAt("/hospital/emergency/7");
    await screen.findByRole("heading", { name: "Request #7" });
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel Request" })).not.toBeInTheDocument();
  });

  it("cancels from the details page and shows the Cancelled status", async () => {
    emergency.cancelRequest.mockResolvedValue(detail({ status: "CANCELLED", status_display: "Cancelled", is_editable: false, is_cancellable: false }));
    renderAt("/hospital/emergency/7");
    await userEvent.click(await screen.findByRole("button", { name: "Cancel Request" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel request" }));
    expect(await screen.findByText("Request cancelled.")).toBeInTheDocument();
    expect(screen.getAllByText("Cancelled", { selector: ".badge" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Cancel Request" })).not.toBeInTheDocument();
  });

  it("does not disclose requests that are not found", async () => {
    emergency.getRequest.mockRejectedValue({ response: { status: 404, data: { detail: "Not found." } } });
    renderAt("/hospital/emergency/999");
    expect(await screen.findByRole("heading", { name: "Request not found" })).toBeInTheDocument();
  });

  it("edits an open request and sends the full editable payload", async () => {
    emergency.updateRequest.mockResolvedValue(detail({ units_required: 5 }));
    renderAt("/hospital/emergency/7/edit");
    expect(await screen.findByRole("heading", { name: "Edit request #7" })).toBeInTheDocument();
    expect(screen.getByLabelText(/patient reference/i)).toHaveValue("CASE-001");
    const units = screen.getByLabelText(/units required/i);
    await userEvent.clear(units);
    await userEvent.type(units, "5");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(emergency.updateRequest).toHaveBeenCalledWith(7, {
      patient_reference: "CASE-001", required_blood_group: "O+", units_required: 5, urgency: "CRITICAL",
      latitude: "9.9312328", longitude: "76.2673041",
    });
    const payload = emergency.updateRequest.mock.calls[0][1];
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("hospital");
    expect(await screen.findByText("Request updated.")).toBeInTheDocument();
  });

  it("disables editing for non-open requests", async () => {
    emergency.getRequest.mockResolvedValue(detail({ status: "MATCHING", status_display: "Matching", is_editable: false }));
    renderAt("/hospital/emergency/7/edit");
    expect(await screen.findByRole("heading", { name: "This request can't be edited" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("shows the server's 409 message when the request stopped being open", async () => {
    emergency.updateRequest.mockRejectedValue({ response: { status: 409, data: { detail: "This request is no longer open, so it cannot be edited." } } });
    renderAt("/hospital/emergency/7/edit");
    await screen.findByRole("heading", { name: "Edit request #7" });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/no longer open/i)).toBeInTheDocument();
  });
});

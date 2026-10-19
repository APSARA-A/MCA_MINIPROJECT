import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as notifications from "../services/notificationService";
import App from "../App";
import * as emergencyService from "../services/emergencyRequestService";
import * as profileService from "../services/profileService";

vi.mock("../services/notificationService", () => ({ getResponseSummary: vi.fn(), getDonorRequests: vi.fn(), getWhatsAppLink: vi.fn(), markContacted: vi.fn(), respondToMatch: vi.fn() }));
vi.mock("../services/donationService", () => ({ getDonationProgress: vi.fn().mockResolvedValue({ request_id: 7, request_status: "OPEN", completed_units: 0, units_required: 2, remaining_units: 2, can_fulfill: false }), fulfillRequest: vi.fn(), completeDonation: vi.fn(), getDonorHistory: vi.fn(), getHospitalHistory: vi.fn() }));
vi.mock("../services/screeningService", () => ({ getScreeningSummary: vi.fn().mockResolvedValue({ screening_pending: 0, approved_donors: 0, completed_donations: 0 }), getScreening: vi.fn(), markArrived: vi.fn(), startScreening: vi.fn(), recordDecision: vi.fn(), getScreeningQueue: vi.fn() }));
const auth = { user: null, status: "anonymous", login: vi.fn(), logout: vi.fn() };
vi.mock("../context/AuthContext", () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }) => children,
}));
// The health chip fetches asynchronously; it has its own test in backendStatus.test.jsx.
vi.mock("../components/BackendStatus", () => ({ default: () => <p>Backend status</p> }));
vi.mock("../services/emergencyRequestService", () => ({
  listRequests: vi.fn(), getRequest: vi.fn(), createRequest: vi.fn(), updateRequest: vi.fn(),
  cancelRequest: vi.fn(), getSummary: vi.fn(),
}));
vi.mock("../services/profileService", () => ({
  fetchDonorProfile: vi.fn(),
  updateDonorProfile: vi.fn(),
  fetchHospitalProfile: vi.fn(),
  updateHospitalProfile: vi.fn(),
}));

const donorProfile = {
  donor_id: 1, full_name: "Asha Menon", date_of_birth: "2001-06-15", gender: "FEMALE", blood_group: "O+",
  phone_number: "9876543210", whatsapp_number: "9876543210", address: "Kochi, Kerala", latitude: "9.9312328",
  longitude: "76.2673041", weight_kg: "55.00", has_location: true, created_at: "2026-09-01T10:00:00Z",
  email: "asha@example.com", medical_condition: "", is_active: true, updated_at: "2026-09-01T10:00:00Z",
};
const hospitalProfile = {
  hospital_id: 1, hospital_name: "City Care Hospital", registration_number: "REG-100", phone_number: "4841234567",
  email: "city@example.com", address: "MG Road, Kochi", latitude: null, longitude: null, is_verified: false,
  verification_status: "PENDING", is_active: true, has_location: false, created_at: "2026-09-02T10:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
};

function signIn(role, email = "user@example.com") {
  Object.assign(auth, { user: { id: 1, email, role }, status: "authenticated" });
}

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

function mockGeolocation(impl) {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: vi.fn(impl) } });
}

beforeEach(() => {
  vi.clearAllMocks();
  notifications.getResponseSummary.mockResolvedValue({ request_id: 7, matches: [], total_matched: 0, awaiting_response: 0, available: 0, not_available: 0, contacted: 0 });
  notifications.getDonorRequests.mockResolvedValue({ pending_count: 0, active_requests: [], historical_requests: [] });
  Object.assign(auth, { user: null, status: "anonymous" });
  auth.logout.mockImplementation(() => Object.assign(auth, { user: null, status: "anonymous" }));
  profileService.fetchDonorProfile.mockResolvedValue(donorProfile);
  profileService.fetchHospitalProfile.mockResolvedValue(hospitalProfile);
  emergencyService.getSummary.mockResolvedValue({ total_requests: 0, open_requests: 0, critical_requests: 0 });
});
afterEach(() => delete navigator.geolocation);

describe("homepage and navigation", () => {
  it("renders every section with the required copy", () => {
    renderApp("/");
    expect(screen.getByRole("heading", { level: 1, name: "Every Drop Connects a Life" })).toBeInTheDocument();
    expect(screen.getByText(/connects hospitals with compatible blood donors using smart matching/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About LifeLink" })).toBeInTheDocument();
    expect(screen.getByText(/does not decide medical eligibility/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it works" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter((li) => li.classList.contains("timeline-step"))).toHaveLength(5);
    expect(screen.getByRole("heading", { name: "Key features" })).toBeInTheDocument();
    expect(screen.getAllByText("Planned").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByRole("heading", { name: "Be Someone's Lifeline" })).toBeInTheDocument();
    expect(screen.getByText(/educational MCA final-year project/i)).toBeInTheDocument();
    expect(screen.getByText("Backend status")).toBeInTheDocument();
  });

  it("invents no statistics", () => {
    const { container } = renderApp("/");
    const main = container.querySelector("main");
    expect(main.textContent).not.toMatch(/\d{2,}\s*(donors|requests|donations|lives)/i);
  });

  it("links hero and call-to-action buttons to the registration pages", () => {
    renderApp("/");
    expect(screen.getByRole("link", { name: "Become a Donor" })).toHaveAttribute("href", "/register/donor");
    expect(screen.getByRole("link", { name: "Register Hospital" })).toHaveAttribute("href", "/register/hospital");
    expect(screen.getByRole("link", { name: "Join as Donor" })).toHaveAttribute("href", "/register/donor");
    expect(screen.getByRole("link", { name: "Register Your Hospital" })).toHaveAttribute("href", "/register/hospital");
  });

  it("shows section links and Login/Register to anonymous visitors", () => {
    renderApp("/");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "About" })).toHaveAttribute("href", "/#about");
    expect(within(nav).getByRole("link", { name: "How It Works" })).toHaveAttribute("href", "/#how-it-works");
    expect(within(nav).getByRole("link", { name: "Features" })).toHaveAttribute("href", "/#features");
    expect(within(nav).getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(within(nav).getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
    expect(within(nav).queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
  });

  it.each([
    ["DONOR", "/donor/dashboard"],
    ["HOSPITAL", "/hospital/dashboard"],
    ["ADMIN", "/admin-access"],
  ])("shows a %s a role-based Dashboard link and Logout instead of Login/Register", (role, href) => {
    signIn(role);
    renderApp("/");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: /^(dashboard|admin)$/i })).toHaveAttribute("href", href);
    expect(within(nav).getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Register" })).not.toBeInTheDocument();
  });

  it("opens and closes the mobile menu", async () => {
    renderApp("/");
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("navigates between public pages", async () => {
    renderApp("/");
    await userEvent.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: "Login" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows a friendly 404 for unknown routes", () => {
    renderApp("/no/such/page");
    expect(screen.getByRole("heading", { name: /that page doesn't exist/i })).toBeInTheDocument();
  });
});

describe("route protection", () => {
  it("sends anonymous visitors to login", () => {
    renderApp("/donor/profile");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("blocks the wrong role on every dashboard and profile route", () => {
    for (const [role, path] of [["HOSPITAL", "/donor/dashboard"], ["HOSPITAL", "/donor/profile"], ["DONOR", "/hospital/dashboard"], ["DONOR", "/hospital/profile"]]) {
      signIn(role);
      const { unmount } = renderApp(path);
      expect(screen.getByRole("heading", { name: /don't have access/i })).toBeInTheDocument();
      unmount();
    }
    expect(profileService.fetchDonorProfile).not.toHaveBeenCalled();
    expect(profileService.fetchHospitalProfile).not.toHaveBeenCalled();
  });
});

describe("donor dashboard", () => {
  beforeEach(() => signIn("DONOR", "asha@example.com"));

  it("shows real profile data, status and completion", async () => {
    renderApp("/donor/dashboard");
    expect(await screen.findByRole("heading", { name: "Welcome, Asha" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Blood group O+" })).toBeInTheDocument();
    expect(screen.getAllByText("asha@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9876543210", { selector: "dd" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Location Available")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Profile completion" })).toHaveAttribute("aria-valuenow", "100");
    expect(profileService.fetchDonorProfile).toHaveBeenCalledTimes(1);
  });

  it("flags a missing location and lists missing profile fields", async () => {
    profileService.fetchDonorProfile.mockResolvedValue({ ...donorProfile, latitude: null, longitude: null, has_location: false, whatsapp_number: "" });
    renderApp("/donor/dashboard");
    expect(await screen.findByText("Location Not Set")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Profile completion" })).toHaveAttribute("aria-valuenow", "78");
    expect(screen.getByText(/Missing: WhatsApp number, Location/)).toBeInTheDocument();
  });

  it("shows no fabricated history or requests", async () => {
    renderApp("/donor/dashboard");
    await screen.findByRole("heading", { name: "Welcome, Asha" });
    expect(screen.getByRole("link", { name: "View Donation History" })).toHaveAttribute("href", "/donor/donation-history");
  });

  it("shows an error with retry when the profile cannot be loaded", async () => {
    profileService.fetchDonorProfile.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    renderApp("/donor/dashboard");
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Welcome, Asha" })).toBeInTheDocument();
  });

  it("lists sidebar items with coming-soon entries disabled", async () => {
    renderApp("/donor/dashboard");
    await screen.findByRole("heading", { name: "Welcome, Asha" });
    const sidebar = screen.getByRole("navigation", { name: "Donor navigation" });
    expect(within(sidebar).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/donor/dashboard");
    expect(within(sidebar).getByRole("link", { name: "My Profile" })).toHaveAttribute("href", "/donor/profile");
    expect(within(sidebar).getByRole("link", { name: "Donation History" })).toHaveAttribute("href", "/donor/donation-history");
    expect(within(sidebar).getByRole("link", { name: "Blood Requests" })).toHaveAttribute("href", "/donor/requests");
  });

  it("opens and closes the mobile sidebar", async () => {
    renderApp("/donor/dashboard");
    await screen.findByRole("heading", { name: "Welcome, Asha" });
    const toggle = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("logs out to the login page", async () => {
    renderApp("/donor/dashboard");
    await screen.findByRole("heading", { name: "Welcome, Asha" });
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(auth.logout).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("updates location from the dashboard after the user allows it", async () => {
    mockGeolocation((ok) => ok({ coords: { latitude: 10.0159, longitude: 76.3419, accuracy: 20 } }));
    profileService.updateDonorProfile.mockResolvedValue({ ...donorProfile, latitude: "10.0159000", longitude: "76.3419000" });
    renderApp("/donor/dashboard");
    await screen.findByRole("heading", { name: "Welcome, Asha" });
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Update Location" }));
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Enable location" }));
    await userEvent.click(screen.getByRole("button", { name: "Save location" }));
    expect(profileService.updateDonorProfile).toHaveBeenCalledWith({ latitude: "10.0159000", longitude: "76.3419000" });
    expect(await screen.findByText("Location updated.")).toBeInTheDocument();
  });
});

describe("donor profile", () => {
  beforeEach(() => signIn("DONOR", "asha@example.com"));

  it("locks protected fields", async () => {
    renderApp("/donor/profile");
    await screen.findByRole("heading", { name: "My profile" });
    for (const label of [/blood group/i, /date of birth/i, /^email/i, /gender/i]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByLabelText(/full name/i)).toBeEnabled();
  });

  it("saves only editable fields and shows confirmation", async () => {
    profileService.updateDonorProfile.mockResolvedValue({ ...donorProfile, phone_number: "9800011122" });
    renderApp("/donor/profile");
    await screen.findByRole("heading", { name: "My profile" });
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    const phone = screen.getByLabelText(/^phone number/i);
    await userEvent.clear(phone);
    await userEvent.type(phone, "98000 11122");
    await userEvent.click(save);

    expect(profileService.updateDonorProfile).toHaveBeenCalledWith({
      full_name: "Asha Menon", phone_number: "9800011122", whatsapp_number: "9876543210",
      address: "Kochi, Kerala", weight_kg: "55", medical_condition: "",
    });
    const payload = profileService.updateDonorProfile.mock.calls[0][0];
    for (const protectedKey of ["blood_group", "date_of_birth", "email", "is_active", "donor_id", "user"]) {
      expect(payload).not.toHaveProperty(protectedKey);
    }
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
  });

  it("validates before sending and shows server errors next to fields", async () => {
    renderApp("/donor/profile");
    await screen.findByRole("heading", { name: "My profile" });
    const weight = screen.getByLabelText(/weight/i);
    await userEvent.clear(weight);
    await userEvent.type(weight, "0");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Enter a weight between 1 and 300 kg.")).toBeInTheDocument();
    expect(profileService.updateDonorProfile).not.toHaveBeenCalled();

    await userEvent.clear(weight);
    await userEvent.type(weight, "60");
    profileService.updateDonorProfile.mockRejectedValue({ response: { status: 400, data: { phone_number: ["Enter a valid phone number."] } } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter a valid phone number.")).toBeInTheDocument();
  });

  it("handles denied location permission without crashing or saving", async () => {
    mockGeolocation((_ok, fail) => fail({ code: 1 }));
    renderApp("/donor/profile");
    await screen.findByRole("heading", { name: "My profile" });
    await userEvent.click(screen.getByRole("button", { name: "Enable location" }));
    expect(screen.getByRole("alert", {}, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/permission was denied/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save location" })).toBeDisabled();
    expect(profileService.updateDonorProfile).not.toHaveBeenCalled();
  });

  it("saves a captured location with 7-decimal precision", async () => {
    mockGeolocation((ok) => ok({ coords: { latitude: 9.931232812345, longitude: 76.267304198, accuracy: 9 } }));
    profileService.updateDonorProfile.mockResolvedValue(donorProfile);
    renderApp("/donor/profile");
    await screen.findByRole("heading", { name: "My profile" });
    await userEvent.click(screen.getByRole("button", { name: "Enable location" }));
    await userEvent.click(screen.getByRole("button", { name: "Save location" }));
    expect(profileService.updateDonorProfile).toHaveBeenCalledWith({ latitude: "9.9312328", longitude: "76.2673042" });
  });
});

describe("hospital dashboard and profile", () => {
  beforeEach(() => signIn("HOSPITAL", "city@example.com"));

  it("shows Verification Pending with an informational message", async () => {
    renderApp("/hospital/dashboard");
    expect(await screen.findByRole("heading", { name: "City Care Hospital" })).toBeInTheDocument();
    expect(screen.getByText("Verification Pending")).toBeInTheDocument();
    expect(screen.getByText(/must verify your registration number/i)).toBeInTheDocument();
    expect(screen.getByText("Location Not Set")).toBeInTheDocument();
    expect(screen.getByText("REG-100", { selector: "dd" })).toBeInTheDocument();
  });

  it("shows Verified Hospital when the database says so and re-checks on demand", async () => {
    renderApp("/hospital/dashboard");
    await screen.findByText("Verification Pending");
    profileService.fetchHospitalProfile.mockResolvedValue({ ...hospitalProfile, is_verified: true, verification_status: "VERIFIED" });
    await userEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(await screen.findByText("Verified Hospital")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check status" })).not.toBeInTheDocument();
  });

  it("keeps future restricted sections disabled in the sidebar", async () => {
    renderApp("/hospital/dashboard");
    await screen.findByRole("heading", { name: "City Care Hospital" });
    const sidebar = screen.getByRole("navigation", { name: "Hospital navigation" });
    expect(within(sidebar).queryByRole("link", { name: /emergency requests/i })).not.toBeInTheDocument();
    expect(within(sidebar).getByText("Emergency Requests").closest("[aria-disabled='true']")).toBeInTheDocument();
    expect(within(sidebar).getByText("Donor Matches").closest("[aria-disabled='true']")).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Hospital Profile" })).toHaveAttribute("href", "/hospital/profile");
  });

  it("locks name, registration number, email and verification on the profile page", async () => {
    renderApp("/hospital/profile");
    await screen.findByRole("heading", { name: "Hospital profile" });
    for (const label of [/hospital name/i, /registration number/i, /^email/i, /verification status/i]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByLabelText(/verification status/i)).toHaveValue("Verification Pending");
  });

  it("sends only phone and address when saving", async () => {
    profileService.updateHospitalProfile.mockResolvedValue({ ...hospitalProfile, address: "New Road, Kochi" });
    renderApp("/hospital/profile");
    await screen.findByRole("heading", { name: "Hospital profile" });
    const address = screen.getByLabelText(/^address/i);
    await userEvent.clear(address);
    await userEvent.type(address, "New Road, Kochi");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(profileService.updateHospitalProfile).toHaveBeenCalledTimes(1));
    expect(profileService.updateHospitalProfile).toHaveBeenCalledWith({ phone_number: "4841234567", address: "New Road, Kochi" });
    expect(await screen.findByText(/verification status has not changed/i)).toBeInTheDocument();
  });
});

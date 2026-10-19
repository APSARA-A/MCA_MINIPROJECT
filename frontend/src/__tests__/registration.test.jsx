import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DonorRegister from "../pages/DonorRegister";
import HospitalRegister from "../pages/HospitalRegister";
import * as authService from "../services/authService";

vi.mock("../services/authService", () => ({
  registerDonor: vi.fn(),
  registerHospital: vi.fn(),
}));

function renderPage(element, path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const type = (label, text) => userEvent.type(screen.getByLabelText(label), text);

beforeEach(() => vi.clearAllMocks());
afterEach(() => delete navigator.geolocation);

async function fillDonor({ confirm = "StrongPass@123" } = {}) {
  await type(/full name/i, "Example Donor");
  await type(/^email/i, "Donor@Example.com");
  await type(/^password/i, "StrongPass@123");
  await type(/confirm password/i, confirm);
  await userEvent.type(screen.getByLabelText(/date of birth/i), "2001-06-15");
  await userEvent.selectOptions(screen.getByLabelText(/gender/i), "FEMALE");
  await userEvent.selectOptions(screen.getByLabelText(/blood group/i), "O+");
  await type(/^phone number/i, "98765 43210");
  await type(/weight/i, "55");
}

describe("DonorRegister", () => {
  it("submits GPS coordinates rounded to 7 decimals and cleaned data", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 9.931232812345, longitude: 76.267304198, accuracy: 8 } }) },
    });
    authService.registerDonor.mockResolvedValue({});
    renderPage(<DonorRegister />, "/register/donor");

    await fillDonor();
    await userEvent.click(screen.getByRole("button", { name: /enable location/i }));
    await userEvent.click(screen.getByRole("button", { name: /create donor account/i }));

    expect(authService.registerDonor).toHaveBeenCalledTimes(1);
    const payload = authService.registerDonor.mock.calls[0][0];
    expect(payload).toMatchObject({
      email: "donor@example.com",
      blood_group: "O+",
      phone_number: "9876543210",
      latitude: "9.9312328",
      longitude: "76.2673042",
      weight_kg: "55",
    });
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("registers without GPS and sends no coordinates", async () => {
    authService.registerDonor.mockResolvedValue({});
    renderPage(<DonorRegister />, "/register/donor");
    await fillDonor();
    await userEvent.click(screen.getByRole("button", { name: /create donor account/i }));
    const payload = authService.registerDonor.mock.calls[0][0];
    expect(payload).not.toHaveProperty("latitude");
    expect(payload).not.toHaveProperty("longitude");
  });

  it("blocks submission on mismatched passwords", async () => {
    renderPage(<DonorRegister />, "/register/donor");
    await fillDonor({ confirm: "Different@123" });
    await userEvent.click(screen.getByRole("button", { name: /create donor account/i }));
    expect(authService.registerDonor).not.toHaveBeenCalled();
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("shows server field errors next to the field", async () => {
    authService.registerDonor.mockRejectedValue({ response: { status: 400, data: { email: ["An account with this email already exists."] } } });
    renderPage(<DonorRegister />, "/register/donor");
    await fillDonor();
    await userEvent.click(screen.getByRole("button", { name: /create donor account/i }));
    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    renderPage(<DonorRegister />, "/register/donor");
    const field = screen.getByLabelText(/^password/i);
    expect(field).toHaveAttribute("type", "password");
    await userEvent.click(screen.getAllByRole("button", { name: /show password/i })[0]);
    expect(field).toHaveAttribute("type", "text");
  });
});

describe("HospitalRegister", () => {
  it("submits a hospital without an is_verified field", async () => {
    authService.registerHospital.mockResolvedValue({});
    renderPage(<HospitalRegister />, "/register/hospital");
    await type(/hospital name/i, "Example Hospital");
    await type(/registration number/i, "HOSP123456");
    await type(/^email/i, "hospital@example.com");
    await type(/^password/i, "StrongPass@123");
    await type(/confirm password/i, "StrongPass@123");
    await type(/phone number/i, "9876543210");
    await type(/address/i, "Kochi, Kerala");
    await userEvent.click(screen.getByRole("button", { name: /register hospital/i }));

    const payload = authService.registerHospital.mock.calls[0][0];
    expect(payload.registration_number).toBe("HOSP123456");
    expect(payload).not.toHaveProperty("is_verified");
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });
});

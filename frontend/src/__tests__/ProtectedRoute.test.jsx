import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ProtectedRoute from "../components/ProtectedRoute";

const auth = { user: null, status: "anonymous" };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));

function renderAt(path = "/donor/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/unauthorized" element={<p>unauthorized page</p>} />
        <Route path="/donor/dashboard" element={<ProtectedRoute roles={["DONOR"]}><p>donor area</p></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("redirects anonymous visitors to login", () => {
    Object.assign(auth, { user: null, status: "anonymous" });
    renderAt();
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("shows a spinner while the session is verified", () => {
    Object.assign(auth, { user: null, status: "loading" });
    renderAt();
    expect(screen.getByRole("status")).toHaveTextContent(/checking your session/i);
  });

  it("sends the wrong role to /unauthorized", () => {
    Object.assign(auth, { user: { role: "HOSPITAL" }, status: "authenticated" });
    renderAt();
    expect(screen.getByText("unauthorized page")).toBeInTheDocument();
  });

  it("renders the page for the right role", () => {
    Object.assign(auth, { user: { role: "DONOR" }, status: "authenticated" });
    renderAt();
    expect(screen.getByText("donor area")).toBeInTheDocument();
  });
});

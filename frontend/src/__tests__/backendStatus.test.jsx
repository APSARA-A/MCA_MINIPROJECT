import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BackendStatus from "../components/BackendStatus";
import * as healthService from "../services/healthService";

vi.mock("../services/healthService", () => ({ getHealth: vi.fn() }));

describe("BackendStatus", () => {
  it("shows connected when /api/health/ answers", async () => {
    healthService.getHealth.mockResolvedValue({ status: "ok", project: "LifeLink" });
    render(<BackendStatus />);
    expect(await screen.findByText("Backend connected")).toBeInTheDocument();
  });

  it("shows unreachable when the request fails", async () => {
    healthService.getHealth.mockRejectedValue(new Error("Network Error"));
    render(<BackendStatus />);
    expect(await screen.findByText("Backend not reachable")).toBeInTheDocument();
  });
});

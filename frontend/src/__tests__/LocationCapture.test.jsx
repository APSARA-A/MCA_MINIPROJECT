import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocationCapture from "../components/LocationCapture";

function Harness({ onValue }) {
  const [value, setValue] = useState(null);
  return (
    <LocationCapture
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

function mockGeolocation(impl) {
  const getCurrentPosition = vi.fn(impl);
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
  return getCurrentPosition;
}

afterEach(() => {
  delete navigator.geolocation;
});

describe("LocationCapture", () => {
  it("does not ask for permission until the button is clicked", () => {
    const spy = mockGeolocation(() => {});
    render(<Harness />);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/Location not captured/i)).toBeInTheDocument();
  });

  it("captures coordinates with the required options and shows read-only values", async () => {
    const spy = mockGeolocation((ok) => ok({ coords: { latitude: 9.9312328, longitude: 76.2673041, accuracy: 12.4 } }));
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.click(screen.getByRole("button", { name: /enable location/i }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    expect(onValue).toHaveBeenCalledWith({ latitude: 9.9312328, longitude: 76.2673041 });
    expect(screen.getByText("Location captured successfully")).toBeInTheDocument();
    expect(screen.getByText("9.931233")).toBeInTheDocument();
  });

  it("treats 0,0 as a valid position", async () => {
    mockGeolocation((ok) => ok({ coords: { latitude: 0, longitude: 0, accuracy: 5 } }));
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /enable location/i }));
    expect(screen.getByText("Location captured successfully")).toBeInTheDocument();
  });

  it("handles denied permission without inventing coordinates", async () => {
    mockGeolocation((_ok, fail) => fail({ code: 1, message: "denied" }));
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.click(screen.getByRole("button", { name: /enable location/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/permission was denied/i);
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText("Location captured successfully")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("explains timeouts and unavailable positions", async () => {
    mockGeolocation((_ok, fail) => fail({ code: 3 }));
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /enable location/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/too long/i);
  });

  it("reports an unsupported browser and disables the button", () => {
    render(<Harness />);
    expect(screen.getByRole("alert")).toHaveTextContent(/does not support location/i);
    expect(screen.getByRole("button", { name: /enable location/i })).toBeDisabled();
  });
});

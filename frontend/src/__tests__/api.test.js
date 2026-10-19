import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "../services/api";
import { parseApiError } from "../services/errors";
import { tokenStorage } from "../services/tokenStorage";

beforeEach(() => vi.restoreAllMocks());

function respond(config, status, data = {}) {
  const response = { status, data, config, headers: {}, statusText: "" };
  if (status < 400) return Promise.resolve(response);
  const error = new Error(`status ${status}`);
  error.config = config;
  error.response = response;
  return Promise.reject(error);
}

describe("api interceptors", () => {
  it("refreshes an expired access token once and retries the request", async () => {
    tokenStorage.set({ access: "old", refresh: "refresh-1" });
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { access: "new-access" } });
    const seen = [];
    api.defaults.adapter = (config) => {
      seen.push(config.headers.Authorization);
      return config.headers.Authorization === "Bearer new-access" ? respond(config, 200, { ok: true }) : respond(config, 401);
    };

    const { data } = await api.get("/api/auth/me/");
    expect(data).toEqual({ ok: true });
    expect(post).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["Bearer old", "Bearer new-access"]);
    expect(tokenStorage.getAccess()).toBe("new-access");
  });

  it("ends the session when the refresh token is rejected", async () => {
    tokenStorage.set({ access: "old", refresh: "bad" });
    vi.spyOn(axios, "post").mockRejectedValue(new Error("expired"));
    api.defaults.adapter = (config) => respond(config, 401);
    const onLogout = vi.fn();
    window.addEventListener("auth:logout", onLogout);

    await expect(api.get("/api/auth/me/")).rejects.toBeTruthy();
    expect(tokenStorage.hasSession()).toBe(false);
    expect(onLogout).toHaveBeenCalled();
    window.removeEventListener("auth:logout", onLogout);
  });

  it("does not try to refresh on a failed login", async () => {
    tokenStorage.set({ access: "a", refresh: "r" });
    const post = vi.spyOn(axios, "post");
    api.defaults.adapter = (config) => respond(config, 401, { detail: "Invalid email or password." });
    await expect(api.post("/api/auth/login/", {})).rejects.toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("parseApiError", () => {
  it("maps field errors, detail messages, throttling and network failures", () => {
    expect(parseApiError({ response: { status: 400, data: { email: ["Taken."], password: ["a", "b"] } } }).fields).toEqual({ email: "Taken.", password: "a b" });
    expect(parseApiError({ response: { status: 401, data: { detail: "Invalid email or password." } } }).general).toBe("Invalid email or password.");
    expect(parseApiError({ response: { status: 429, data: {} } }).general).toMatch(/too many/i);
    expect(parseApiError(new Error("Network Error")).general).toMatch(/cannot reach the server/i);
  });
});

describe("session changes during requests", () => {
  it("does not restore credentials after logout while refresh is pending", async () => {
    tokenStorage.set({ access: "old", refresh: "session-a" });
    let resolve;
    vi.spyOn(axios, "post").mockImplementation(() => new Promise(done => { resolve = done; }));
    api.defaults.adapter = config => respond(config, 401);
    const pending = api.get("/api/auth/me/");
    const rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    tokenStorage.clear();
    resolve({ data: { access: "stale-access" } });
    await rejected;
    expect(tokenStorage.hasSession()).toBe(false);
  });
  it("does not overwrite or log out a new login when an older refresh fails", async () => {
    tokenStorage.set({ access: "old", refresh: "session-a" });
    let reject;
    vi.spyOn(axios, "post").mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    api.defaults.adapter = config => respond(config, 401);
    const rejected = expect(api.get("/api/auth/me/")).rejects.toBeTruthy();
    await vi.waitFor(() => expect(reject).toBeTypeOf("function"));
    tokenStorage.set({ access: "new-login", refresh: "session-b" });
    reject(new Error("old refresh failed"));
    await rejected;
    expect(tokenStorage.getAccess()).toBe("new-login");
  });
  it("rejects a late 401 from a previous session without refreshing the new session", async () => {
    tokenStorage.set({ access: "old", refresh: "session-a" });
    let fail;
    const post = vi.spyOn(axios, "post");
    api.defaults.adapter = config => new Promise((_, reject) => { fail = () => respond(config, 401).catch(reject); });
    const rejected = expect(api.get("/api/auth/me/")).rejects.toBeTruthy();
    await vi.waitFor(() => expect(fail).toBeTypeOf("function"));
    tokenStorage.set({ access: "new-login", refresh: "session-b" });
    fail(); await rejected;
    expect(post).not.toHaveBeenCalled();
    expect(tokenStorage.getAccess()).toBe("new-login");
  });
});

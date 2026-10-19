// SECURITY NOTE (local MVP only): tokens live in sessionStorage, which any
// script running on the page can read (XSS). That is acceptable for a local
// demo but NOT production-ready; production should use httpOnly, SameSite
// cookies set by the backend. Only tokens are stored here; profile and
// medical data stay in React memory.
const ACCESS_KEY = "lifelink.access";
const REFRESH_KEY = "lifelink.refresh";

function read(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable: session will not survive a refresh */
  }
}

export const tokenStorage = {
  getAccess: () => read(ACCESS_KEY),
  getRefresh: () => read(REFRESH_KEY),
  hasSession: () => Boolean(read(ACCESS_KEY) || read(REFRESH_KEY)),
  set({ access, refresh }) {
    if (access !== undefined) write(ACCESS_KEY, access);
    if (refresh !== undefined) write(REFRESH_KEY, refresh);
  },
  clear() {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
  },
};

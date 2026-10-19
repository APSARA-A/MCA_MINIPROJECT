import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as authService from "../services/authService";
import { tokenStorage } from "../services/tokenStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" only while a stored session is being verified with /api/auth/me/.
  const [status, setStatus] = useState(() => (tokenStorage.hasSession() ? "loading" : "anonymous"));

  useEffect(() => {
    if (!tokenStorage.hasSession()) return undefined;
    let cancelled = false;
    authService
      .fetchMe()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch((error) => {
        if (cancelled) return;
        const code = error.response?.status;
        if (code === 401 || code === 403) tokenStorage.clear();
        setUser(null);
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The API layer fires this when a refresh fails (expired or revoked session).
  useEffect(() => {
    const onForcedLogout = () => {
      setUser(null);
      setStatus("anonymous");
    };
    window.addEventListener("auth:logout", onForcedLogout);
    return () => window.removeEventListener("auth:logout", onForcedLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    const account = await authService.login(email, password);
    setUser(account);
    setStatus("authenticated");
    return account;
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

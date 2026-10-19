import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { parseApiError } from "../services/errors";
import {
  fetchDonorProfile,
  fetchHospitalProfile,
  updateDonorProfile,
  updateHospitalProfile,
} from "../services/profileService";

const ProfileContext = createContext(null);

const BY_ROLE = {
  DONOR: { load: fetchDonorProfile, save: updateDonorProfile },
  HOSPITAL: { load: fetchHospitalProfile, save: updateHospitalProfile },
};

/**
 * Loads the signed-in user's profile once for the whole dashboard area, so the
 * dashboard and profile pages share one request instead of refetching on every
 * navigation. The API derives the profile from the JWT; no id is ever sent.
 */
export function ProfileProvider({ role, children }) {
  const endpoints = BY_ROLE[role];
  const [state, setState] = useState({ status: "loading", profile: null, error: "" });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, error: "", status: s.profile ? "refreshing" : "loading" }));
    try {
      const profile = await endpoints.load();
      setState({ status: "ready", profile, error: "" });
    } catch (error) {
      setState((s) => ({ ...s, status: "error", error: parseApiError(error).general || "Could not load your profile." }));
    }
  }, [endpoints]);

  useEffect(() => {
    // Initial fetch: state is set only after the awaited request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  /** PATCHes the profile; resolves with the updated profile, rejects with the axios error. */
  const save = useCallback(
    async (patch) => {
      const profile = await endpoints.save(patch);
      setState({ status: "ready", profile, error: "" });
      return profile;
    },
    [endpoints]
  );

  const value = useMemo(() => ({ ...state, reload: load, save }), [state, load, save]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used inside <ProfileProvider>");
  return context;
}

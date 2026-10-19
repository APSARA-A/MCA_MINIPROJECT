import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ProfileProvider, useProfile } from "../context/ProfileContext";
import Logo from "./Logo";

const ICONS = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  drop: "M12 3s6 6.2 6 10.4a6 6 0 0 1-12 0C6 9.2 12 3 12 3Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  out: "M10 4H5v16h5M16 8l4 4-4 4M20 12H9",
  plus: "M12 5v14M5 12h14",
};

function Icon({ name }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const NAV = {
  DONOR: [
    { to: "/donor/dashboard", label: "Dashboard", icon: "grid" },
    { to: "/donor/profile", label: "My Profile", icon: "user" },
    { to: "/donor/donation-history", label: "Donation History", icon: "clock" },
    { to: "/donor/requests", label: "Blood Requests", icon: "drop" },
  ],
  HOSPITAL: [
    { to: "/hospital/screening", label: "Screening", icon: "user", needsVerification: true },
    { to: "/hospital/donation-history", label: "Donation History", icon: "clock", needsVerification: true },
    { to: "/hospital/dashboard", label: "Dashboard", icon: "grid" },
    { to: "/hospital/profile", label: "Hospital Profile", icon: "user" },
    {
      to: "/hospital/emergency", label: "Emergency Requests", icon: "drop", needsVerification: true,
      match: (path) => path.startsWith("/hospital/emergency") && path !== "/hospital/emergency/new",
    },
    { to: "/hospital/emergency/new", label: "Create Request", icon: "plus", needsVerification: true },
    { to: "/hospital/emergency", label: "Donor Matches", icon: "link", needsVerification: true, match: (path) => path.endsWith("/matches") },
  ],
};

function Shell({ role }) {
  const { user, logout } = useAuth();
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Restricted hospital pages stay disabled until the profile confirms verification.
  const verified = role !== "HOSPITAL" || Boolean(profile?.is_verified);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="dash-shell">
      <a href="#dash-main" className="skip-link">Skip to content</a>

      <header className="dash-top">
        <button type="button" className="dash-menu" aria-expanded={open} aria-controls="dash-sidebar"
          onClick={() => setOpen((v) => !v)}>
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <Logo />
        <div className="dash-top-right">
          <NavLink to="/" className="dash-top-link">Home</NavLink>
          <span className="avatar" data-initial={(user?.email || "?").charAt(0).toUpperCase()} aria-hidden="true" />
          <span className="badge badge-soft">{role === "DONOR" ? "Donor" : "Hospital"}</span>
          <span className="dash-email">{user?.email}</span>
        </div>
      </header>

      <div className={`drawer-backdrop${open ? " is-open" : ""}`} onClick={close} aria-hidden="true" />

      <aside id="dash-sidebar" className={`sidebar${open ? " is-open" : ""}`}>
        <nav aria-label={`${role === "DONOR" ? "Donor" : "Hospital"} navigation`}>
          <ul className="sidebar-list">
            {NAV[role].map((item) => (
              <li key={item.label}>
                {item.soon || (item.needsVerification && !verified) ? (
                  <span className="sidebar-item is-soon" aria-disabled="true">
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    <span className="soon-tag">{item.soon ? "Coming soon" : "Needs verification"}</span>
                  </span>
                ) : (
                  <Link
                    to={item.to}
                    className={`sidebar-item${(item.match ? item.match(pathname) : pathname === item.to) ? " active" : ""}`}
                    aria-current={(item.match ? item.match(pathname) : pathname === item.to) ? "page" : undefined}
                    onClick={close}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <button type="button" className="sidebar-item sidebar-logout" onClick={handleLogout}>
          <Icon name="out" />
          <span>Logout</span>
        </button>
      </aside>

      <main id="dash-main" className="dash-content">
        <Outlet />
      </main>
    </div>
  );
}

export default function DashboardLayout({ role }) {
  return (
    <ProfileProvider role={role}>
      <Shell role={role} />
    </ProfileProvider>
  );
}

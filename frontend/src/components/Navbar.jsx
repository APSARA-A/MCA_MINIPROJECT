import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DJANGO_ADMIN_URL, homePathFor } from "../utils/roles";
import Logo from "./Logo";

const ROLE_LABEL = { DONOR: "Donor", HOSPITAL: "Hospital", ADMIN: "Admin" };

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Adds a soft shadow under the bar once the page has been scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleLogout() {
    logout();
    close();
    navigate("/login", { replace: true });
  }

  return (
    <header className={`navbar${scrolled ? " is-scrolled" : ""}`}>
      <div className="navbar-inner">
        <Logo />
        <button
          type="button"
          className="navbar-toggle"
          aria-expanded={open}
          aria-controls="primary-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>

        <nav id="primary-nav" className={`navbar-links${open ? " is-open" : ""}`} aria-label="Primary">
          <NavLink to="/" end onClick={close}>Home</NavLink>
          <Link to={{ pathname: "/", hash: "#about" }} onClick={close}>About</Link>
          <Link to={{ pathname: "/", hash: "#how-it-works" }} onClick={close}>How It Works</Link>
          <Link to={{ pathname: "/", hash: "#features" }} onClick={close}>Features</Link>
          {user ? (
            <>
              <NavLink to={homePathFor(user.role)} onClick={close}>
                {user.role === "ADMIN" ? "Admin" : "Dashboard"}
              </NavLink>
              {user.role === "ADMIN" && (
                <a href={DJANGO_ADMIN_URL} target="_blank" rel="noreferrer">Django Admin</a>
              )}
              <span className="navbar-user">
                <span className="avatar" data-initial={(user.email || "?").charAt(0).toUpperCase()} aria-hidden="true" />
                <span className="badge badge-soft">{ROLE_LABEL[user.role]}</span>
                <span className="navbar-email">{user.email}</span>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <NavLink to="/login" onClick={close}>Login</NavLink>
              <Link to="/register" className="btn btn-primary btn-sm" onClick={close}>Register</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

import { Link, Outlet } from "react-router-dom";
import BackendStatus from "./BackendStatus";
import Logo from "./Logo";
import Navbar from "./Navbar";

const YEAR = new Date().getFullYear();

export default function AppLayout() {
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="util-bar">
        <div className="util-bar-inner">
          <span>Demo project for learning and evaluation.</span>
          <span><strong>Medical emergency?</strong> Call your local emergency number (112 in India).</span>
        </div>
      </div>
      <Navbar />
      <main id="main" className="app-main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo light />
            <p>
              LifeLink is a smart blood donor matching platform that helps hospitals find compatible,
              nearby donors in an emergency.
            </p>
          </div>
          <nav aria-label="Footer" className="footer-nav">
            <div className="footer-col">
              <p className="footer-col-title">Explore</p>
              <Link to="/">Home</Link>
              <Link to={{ pathname: "/", hash: "#about" }}>About</Link>
              <Link to={{ pathname: "/", hash: "#how-it-works" }}>How It Works</Link>
              <Link to={{ pathname: "/", hash: "#features" }}>Features</Link>
            </div>
            <div className="footer-col">
              <p className="footer-col-title">Get started</p>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
              <Link to="/register/donor">Donor registration</Link>
              <Link to="/register/hospital">Hospital registration</Link>
            </div>
          </nav>
        </div>
        <div className="footer-bottom">
          <p>
            LifeLink is an educational MCA final-year project. It is not a medical service and must not be
            used for real emergencies.
          </p>
          <p>&copy; {YEAR} LifeLink. All rights reserved.</p>
          <BackendStatus />
        </div>
      </footer>
    </div>
  );
}

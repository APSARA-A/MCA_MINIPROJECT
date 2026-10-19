import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { useAuth } from "../context/AuthContext";
import { homePathFor } from "../utils/roles";

export default function Unauthorized() {
  const { user } = useAuth();
  return (
    <div className="page notice-page">
      <span className="notice-icon" aria-hidden="true"><Icon name="lock" size={34} strokeWidth={1.6} /></span>
      <p className="notice-code">403</p>
      <h1>You don't have access to that page</h1>
      <p>This page is for a different type of account. Your own pages are still available.</p>
      <div className="notice-actions">
        <Link className="btn btn-primary" to={user ? homePathFor(user.role) : "/login"}>
          {user ? "Go to my dashboard" : "Sign in"}
        </Link>
        <Link className="btn btn-secondary" to="/">Back to home</Link>
      </div>
    </div>
  );
}

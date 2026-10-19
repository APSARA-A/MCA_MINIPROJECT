import { Link } from "react-router-dom";
import Icon from "../components/Icon";

export default function NotFound() {
  return (
    <div className="page notice-page">
      <span className="notice-icon" aria-hidden="true"><Icon name="search" size={34} strokeWidth={1.6} /></span>
      <p className="notice-code">404</p>
      <h1>That page doesn't exist</h1>
      <p>Check the address, or head back to the home page.</p>
      <div className="notice-actions">
        <Link className="btn btn-primary" to="/">Back to home</Link>
      </div>
    </div>
  );
}

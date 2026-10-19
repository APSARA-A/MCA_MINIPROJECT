import Icon from "../components/Icon";
import { useAuth } from "../context/AuthContext";
import { DJANGO_ADMIN_URL } from "../utils/roles";

export default function AdminNotice() {
  const { user } = useAuth();
  return (
    <div className="page notice-page">
      <span className="notice-icon" aria-hidden="true"><Icon name="shield" size={34} strokeWidth={1.6} /></span>
      <p className="badge badge-soft">Admin</p>
      <h1>Administration happens in Django Admin</h1>
      <p>
        Signed in as {user.email}. Verify hospitals, review donors and manage records in the admin site.
      </p>
      <div className="notice-actions">
        <a className="btn btn-primary" href={DJANGO_ADMIN_URL} target="_blank" rel="noreferrer">
          Open Django Admin
        </a>
      </div>
    </div>
  );
}

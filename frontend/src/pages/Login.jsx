import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import Alert from "../components/Alert";
import AuthShell from "../components/AuthShell";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import { parseApiError } from "../services/errors";
import { homePathFor } from "../utils/roles";
import { validateEmail } from "../utils/validation";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const registered = location.state?.registered;

  const [form, setForm] = useState({ email: registered?.email || "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  const update = (event) => setForm((f) => ({ ...f, [event.target.name]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const next = {};
    validateEmail(form.email, next);
    if (!form.password) next.password = "Enter your password.";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const account = await login(form.email.trim(), form.password);
      navigate(homePathFor(account.role), { replace: true });
    } catch (error) {
      const parsed = parseApiError(error);
      setFormError(parsed.general);
      setErrors(parsed.fields);
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      intro="Sign in to see your donor profile or manage your hospital's account."
      points={["One account per email address", "Sessions end when you close the tab"]}
    >
      <div className="auth-card">
        <h1>Sign in</h1>
        <p className="auth-sub">Use the email you registered with.</p>

        {registered && (
          <Alert tone="success" title="Registration complete">
            {registered.role === "HOSPITAL"
              ? "Sign in to check your verification status. An administrator must verify your hospital before you can raise requests."
              : "Your donor account is ready. Sign in to continue."}
          </Alert>
        )}
        <Alert tone="error">{formError}</Alert>

        <form onSubmit={handleSubmit} noValidate className="form">
          <FormInput label="Email" name="email" type="email" autoComplete="email" value={form.email}
            onChange={update} error={errors.email} />
          <PasswordInput label="Password" name="password" autoComplete="current-password" value={form.password}
            onChange={update} error={errors.password} />
          <Button type="submit" loading={submitting} className="btn-block">Sign in</Button>
        </form>

        <p className="auth-switch">
          New to LifeLink? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </AuthShell>
  );
}

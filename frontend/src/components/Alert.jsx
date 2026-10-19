import Icon from "./Icon";

const ICON = { error: "alert", warning: "alert", success: "check", info: "info" };

export default function Alert({ tone = "info", title, children }) {
  if (!children && !title) return null;
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={ICON[tone] || "info"} size={20} className="alert-icon" />
      <div className="alert-content">
        {title && <strong className="alert-title">{title}</strong>}
        {children && <div className="alert-body">{children}</div>}
      </div>
    </div>
  );
}

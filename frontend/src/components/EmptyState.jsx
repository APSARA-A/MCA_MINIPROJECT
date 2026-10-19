import Icon from "./Icon";

/** Friendly empty or notice panel: icon, title, optional text and actions. */
export default function EmptyState({ icon = "info", title, children, actions, as: Tag = "section", className = "" }) {
  return (
    <Tag className={`card empty-panel ${className}`.trim()}>
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <div className="empty-body">
        {title && <h2>{title}</h2>}
        {children}
      </div>
      {actions && <div className="empty-actions">{actions}</div>}
    </Tag>
  );
}

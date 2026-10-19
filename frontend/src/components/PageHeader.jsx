/** Consistent page title block for every dashboard page. */
export default function PageHeader({ title, children, actions, banner = false, id }) {
  return (
    <header className={`page-header dash-heading${banner ? " page-header-banner" : ""}`}>
      <div className="page-header-main">
        <h1 id={id}>{title}</h1>
        {children}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

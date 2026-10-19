/**
 * Decorative "request board" preview for the home page hero.
 * Everything here is sample data and is labelled as such. It is aria-hidden
 * because it illustrates the workflow and carries no real information.
 */
const DONORS = [
  { name: "Donor A", group: "O+", distance: "1.8 km", reply: "Can come", tone: "badge-ok", fit: 3 },
  { name: "Donor B", group: "A+", distance: "3.1 km", reply: "Awaiting reply", tone: "badge-warn", fit: 2 },
  { name: "Donor C", group: "A-", distance: "4.6 km", reply: "Awaiting reply", tone: "badge-warn", fit: 2 },
  { name: "Donor D", group: "O-", distance: "6.2 km", reply: "Not available", tone: "badge-muted", fit: 1 },
];

function Meter({ level }) {
  return (
    <span className="meter">
      {[1, 2, 3].map((n) => <i key={n} className={n <= level ? "on" : undefined} />)}
    </span>
  );
}

export default function HeroPreview() {
  return (
    <div className="board" aria-hidden="true">
      <div className="board-head">
        <span>Emergency request</span>
        <span className="board-sample">Sample data</span>
      </div>

      <div className="board-request">
        <div className="board-group">
          <svg viewBox="0 0 120 144" focusable="false">
            <path d="M60 6C60 6 14 58 14 90a46 46 0 0 0 92 0C106 58 60 6 60 6Z" fill="var(--crimson)" />
          </svg>
          <span>A+</span>
        </div>
        <div className="board-request-body">
          <p className="board-title">2 units of A+ needed</p>
          <p className="board-meta">Sample City Hospital, raised 4 minutes ago</p>
          <div className="board-tags">
            <span className="badge badge-soft">Critical</span>
            <span className="badge badge-info">Donors contacted</span>
          </div>
        </div>
      </div>

      <p className="board-section">Compatible donors, nearest first</p>
      <ul className="board-list">
        {DONORS.map((donor) => (
          <li key={donor.name} className="board-row">
            <span className="avatar" data-initial={donor.name.slice(-1)} />
            <div>
              <p className="board-row-name">
                {donor.name} <span className="board-group-chip">{donor.group}</span>
              </p>
              <p className="board-row-meta">
                <span>{donor.distance}</span>
                <span className="meter-label"><Meter level={donor.fit} /></span>
              </p>
            </div>
            <span className={`badge ${donor.tone}`}>{donor.reply}</span>
          </li>
        ))}
      </ul>

      <p className="board-foot">Screening and donation are always confirmed by hospital staff.</p>

      <div className="board-toast">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Donor A replied: can come
      </div>
    </div>
  );
}

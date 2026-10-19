/**
 * Blood-group drop badge. The letters come from data-group via CSS, so the badge adds
 * no text to the page (the group is always shown as real text beside it).
 */
export default function BloodDrop({ group, size = "md" }) {
  return <span className={`drop drop-${size}`} data-group={group} aria-hidden="true" />;
}

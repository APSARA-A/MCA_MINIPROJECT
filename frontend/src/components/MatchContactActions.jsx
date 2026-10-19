import { useEffect, useRef, useState } from "react";
import Alert from "./Alert";
import Button from "./Button";
import { getWhatsAppLink, markContacted } from "../services/notificationService";
import { notificationError } from "../utils/matchStatus";

export default function MatchContactActions({ match, onConfirmed }) {
  const [pending, setPending] = useState("");
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const [demoMessage, setDemoMessage] = useState("");
  const busy = useRef(false), alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function openWhatsApp() {
    if (busy.current) return;
    busy.current = true; setPending("link"); setError(""); setLink(""); setDemoMessage("");
    try {
      const data = await getWhatsAppLink(match.match_id);
      if (!alive.current) return;
      const url = new URL(data.whatsapp_url);
      if (url.protocol !== "https:" || url.hostname !== "wa.me" || url.username || url.password || url.port || !/^\/[0-9]+$/.test(url.pathname)) throw new Error("Unsafe WhatsApp URL");
      if (data.demo_only) {
        setDemoMessage(data.message);
        setNotice("Synthetic demo preview only. WhatsApp is not opened and no message is sent.");
        return;
      }
      setLink(url.href);
      window.open(url.href, "_blank", "noopener,noreferrer");
      setNotice("WhatsApp prepares a message. You must manually send it. Opening this link does not confirm contact, sending or delivery.");
    } catch (err) { if (alive.current) setError(notificationError(err)); }
    finally { busy.current = false; if (alive.current) setPending(""); }
  }
  async function confirm() {
    if (busy.current) return;
    busy.current = true; setPending("confirm"); setError("");
    try {
      const data = await markContacted(match.match_id);
      if (!alive.current) return;
      setDialog(false);
      setNotice("Contact attempt confirmed. WhatsApp sending and delivery have not been verified.");
      onConfirmed(data);
    } catch (err) { if (alive.current) setError(notificationError(err)); }
    finally { busy.current = false; if (alive.current) setPending(""); }
  }
  return <div className="dash-stack contact-actions">
    <div className="form-actions"><Button variant="secondary" loading={pending === "link"} disabled={Boolean(pending)} onClick={openWhatsApp}>Contact via WhatsApp</Button>
      {match.match_status === "IDENTIFIED" && <Button variant="secondary" disabled={Boolean(pending)} onClick={() => setDialog(true)}>Confirm Contact Attempt</Button>}</div>
    <Alert tone="error">{error}</Alert><Alert>{notice}</Alert>
    {demoMessage && <section className="card"><h4>Synthetic WhatsApp message preview</h4><p style={{ whiteSpace: "pre-wrap" }}>{demoMessage}</p></section>}
    {link && <a className="text-link" href={link} target="_blank" rel="noopener noreferrer">Open prepared WhatsApp message</a>}
    {dialog && <section className="contact-confirm" role="alertdialog" aria-modal="false" aria-label="Confirm actual contact attempt">
      <p>Did you actually attempt to contact this donor? Opening a WhatsApp link alone does not count.</p>
      <div className="form-actions"><Button loading={pending === "confirm"} disabled={Boolean(pending)} onClick={confirm}>Yes, contact was attempted</Button>
        <Button variant="secondary" disabled={Boolean(pending)} onClick={() => setDialog(false)}>Cancel</Button></div>
    </section>}
  </div>;
}

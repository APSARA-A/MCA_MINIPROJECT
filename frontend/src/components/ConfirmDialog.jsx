import { useEffect, useId, useRef } from "react";
import Button from "./Button";

/** Modal confirmation. Escape and the backdrop dismiss it; focus starts on the safe option. */
export default function ConfirmDialog({ title, children, confirmLabel, cancelLabel = "Keep it", busy = false, onConfirm, onCancel }) {
  const titleId = useId();
  const safeRef = useRef(null), modalRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    safeRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); }
      if (event.key !== "Tab") return;
      const elements = [...modalRef.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
      if (!elements.length) { event.preventDefault(); modalRef.current.focus(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !modalRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !modalRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div ref={modalRef} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId}>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button ref={safeRef} type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

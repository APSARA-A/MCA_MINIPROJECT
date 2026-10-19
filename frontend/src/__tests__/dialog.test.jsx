import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ConfirmDialog from "../components/ConfirmDialog";
it("contains keyboard focus and restores the original trigger", () => {
  const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
  const cancel = vi.fn();
  const view = render(<ConfirmDialog title="Confirm action" confirmLabel="Confirm" onConfirm={() => {}} onCancel={cancel}>Details</ConfirmDialog>);
  const safe = screen.getByRole("button", { name: "Keep it" }), confirm = screen.getByRole("button", { name: "Confirm" });
  expect(safe).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true }); expect(confirm).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab" }); expect(safe).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" }); expect(cancel).toHaveBeenCalledOnce();
  view.unmount(); expect(trigger).toHaveFocus(); trigger.remove();
});
it("prevents Escape dismissal while a confirmed action is pending", () => {
  const cancel = vi.fn();
  render(<ConfirmDialog title="Pending" confirmLabel="Confirm" busy onConfirm={() => {}} onCancel={cancel} />);
  fireEvent.keyDown(document, { key: "Escape" }); expect(cancel).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Tab" }); expect(screen.getByRole("dialog")).toHaveFocus();
});

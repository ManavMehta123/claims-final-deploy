import React from "react";
import Modal from "./Modal";

export default function ConfirmDialog({ title, message, confirmLabel = "Delete", onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} size="sm">
      <p className="muted" style={{ marginTop: 0 }}>{message}</p>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger-solid" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

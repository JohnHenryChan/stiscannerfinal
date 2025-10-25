import React, { useState } from "react";
import ReactDOM from "react-dom";

const ConfirmModal = ({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmClass = "bg-red-600 text-white hover:bg-red-700",
  cancelClass = "bg-gray-200 hover:bg-gray-300",
  closeAfterConfirm = true,
  showCancel = true,
}) => {
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleConfirm = async () => {
    if (!onConfirm) return;
    try {
      setLoading(true);
      // allow onConfirm to be sync or async
      await Promise.resolve(onConfirm());
      if (closeAfterConfirm && typeof onCancel === "function") {
        onCancel();
      }
    } catch (err) {
      // caller handles errors; keep modal open if desired
      console.error("ConfirmModal onConfirm error:", err);
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6">
        {title && <h3 className="text-lg font-semibold mb-2">{title}</h3>}

        <div className="text-sm text-gray-700 mb-4">
          {message}
        </div>

        <div className="flex justify-end gap-3">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className={`px-4 py-2 rounded ${cancelClass}`}
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded flex items-center gap-2 ${confirmClass}`}
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
            ) : null}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;

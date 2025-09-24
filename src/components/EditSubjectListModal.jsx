import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

const EditSubjectListModal = ({
  visible,
  onClose,
  onSave,
  subjects,
  selectedSubjects = [],
  instructorName = "",
}) => {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (visible) setSelected(selectedSubjects);
  }, [visible, selectedSubjects]);

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    onSave(selected);
    onClose();
  };

  if (!visible) return null;

  // Render modal via portal
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4">
          Edit Subjects for {instructorName}
        </h2>

        <div className="max-h-64 overflow-y-auto space-y-2 mb-6 pr-1">
          {subjects.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => toggle(s.id)}
              />
              <span>{s.subject} ({s.yearLevel})</span>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 transition"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EditSubjectListModal;

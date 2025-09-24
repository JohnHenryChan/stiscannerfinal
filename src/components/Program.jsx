import { Edit } from "@mui/icons-material";
import React, { useEffect, useState } from "react";

const Program = ({ visible, onClose, mode, onSubmit, initialData }) => {
  const [programName, setProgramName] = useState("");
  const [instructorName, setInstructorName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (visible) {
      if (mode === "edit" && initialData) {
        setProgramName(initialData.programName || "");
        setInstructorName(initialData.instructorName || "");
      } else {
        setProgramName("");
        setInstructorName("");
      }
      setErrorMessage(""); // Clear errors when opening
    }
  }, [visible, mode, initialData]);

  if (!visible) return null;

  const handleSubmit = () => {
    if (!programName || !instructorName) {
      setErrorMessage("Please fill in both fields.");
      return;
    }

    onSubmit({
      programName,
      instructorName,
    });

    onClose(); // Close modal after submit
  };

  return (
    <div className="flex flex-col items-start p-6">
      {/* Modal Popup */}
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
        <div className="bg-gray-300 p-6 rounded-lg shadow-lg w-96 relative">
          <input
            type="text"
            placeholder="Name of Program"
            className="w-full p-2 border rounded-md mb-3"
            value={programName}
            onChange={(e) => {
              setProgramName(e.target.value);
              setErrorMessage("");
            }}
          />
          <input
            type="text"
            placeholder="Name of Instructor"
            className="w-full p-2 border rounded-md mb-4"
            value={instructorName}
            onChange={(e) => {
              setInstructorName(e.target.value);
              setErrorMessage("");
            }}
          />

          {/* Error Message */}
          {errorMessage && (
            <div className="text-red-600 text-sm mb-3">{errorMessage}</div>
          )}

          {/* Buttons */}
          <div className="flex justify-between">
            <button
              className="w-1/2 bg-blue-700 text-white py-2 rounded-md font-semibold mr-2 flex items-center justify-center gap-1"
              onClick={handleSubmit}
            >
              {mode === "edit" ? (
                <>
                   Update Program
                </>
              ) : (
                "Add Program"
              )}
            </button>

            <button
              className="w-1/2 bg-gray-500 text-white py-2 rounded-md font-semibold"
              onClick={() => {
                onClose();
                setErrorMessage("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Program;

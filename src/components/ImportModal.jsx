// src/components/ImportExcelModal.jsx
import React, { useState } from "react";
import * as XLSX from "xlsx";
import { db } from "../firebaseConfig";
import { doc, setDoc } from "firebase/firestore";

export default function ImportExcelModal({ visible, onClose }) {
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheets, setSelectedSheets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [successDialog, setSuccessDialog] = useState(false);
  const [errorList, setErrorList] = useState([]);

  const handleFileChange = (e) => {
    const uploaded = e.target.files[0];
    if (!uploaded) return;
    setFile(uploaded);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target.result, { type: "binary" });
      setSheets(workbook.SheetNames);
      setSelectedSheets([]);
    };
    reader.readAsBinaryString(uploaded);
  };

  const handleSheetToggle = (sheet) => {
    setSelectedSheets((prev) =>
      prev.includes(sheet)
        ? prev.filter((s) => s !== sheet)
        : [...prev, sheet]
    );
  };

  const handleImport = async () => {
    if (!file || !selectedSheets.length) {
      alert("Please select at least one sheet to import.");
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: 0 });
    setErrorList([]);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const workbook = XLSX.read(e.target.result, { type: "array" });
      const tempErrors = [];
      let totalStudents = 0;
      let processedStudents = 0;

      try {
        for (const sheetName of selectedSheets) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          // --- STUDENT IMPORT ONLY ---
          const yearMapping = {
            G11: "3rd Year",
            G12: "4th Year",
            "1ST YEAR": "1st Year",
            "2ND YEAR": "2nd Year",
            "3RD YEAR": "3rd Year",
            "4TH YEAR": "4th Year",
          };

          const studentRows = rows.slice(14).filter((r) => r && r[1]);
          totalStudents += studentRows.length;
          setProgress({ current: 0, total: totalStudents });

          for (let i = 0; i < studentRows.length; i++) {
            const row = studentRows[i];
            try {
              const studentId = String(row[1] || "").trim();
              const fullName = String(row[3] || "").trim();
              const program = String(row[13] || "").trim();
              const level = String(row[17] || "").trim();

              if (!studentId) throw new Error("Missing student ID.");
              if (!fullName) throw new Error("Missing student name.");

              // Split full name into Last, First
              let [lastName, firstName] = fullName
                .split(",")
                .map((s) => s.trim());
              if (!firstName) firstName = "";
              if (!lastName) lastName = "";

              const year =
                yearMapping[level?.toUpperCase()] || "1st Year";

              // --- Save student only ---
              const studentRef = doc(db, "students", studentId);
              await setDoc(
                studentRef,
                {
                  id: studentId,
                  firstName,
                  lastName,
                  program,
                  year,
                },
                { merge: true }
              );

              processedStudents++;
              setProgress({
                current: processedStudents,
                total: totalStudents,
              });
            } catch (err) {
              tempErrors.push({ row: i + 15, message: err.message });
            }
          }
        }

        setErrorList(tempErrors);
        setSuccessDialog(true);
      } catch (err) {
        console.error("Import error:", err);
        alert("Error importing file. Please check Excel format.");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleCloseSuccess = () => {
    setSuccessDialog(false);
    onClose();
    setFile(null);
    setErrorList([]);
  };

  if (!visible) return null;

  const percent =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <>
      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-[9999]">
        <div className="bg-white p-6 rounded-xl w-full max-w-lg shadow-lg">
          <h2 className="text-lg font-semibold mb-4">
            Import Students (Excel)
          </h2>

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="border border-gray-300 rounded-md p-2 w-full mb-4"
          />

          {sheets.length > 0 && (
            <div className="mb-4">
              <p className="font-medium mb-2">Select Sheets to Import:</p>
              <div className="border p-2 rounded max-h-40 overflow-auto">
                {sheets.map((sheet) => (
                  <label
                    key={sheet}
                    className="flex items-center gap-2 py-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSheets.includes(sheet)}
                      onChange={() => handleSheetToggle(sheet)}
                    />
                    <span>{sheet}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="bg-gray-50 border p-3 rounded-md mb-4">
              <p className="text-gray-700 text-sm mb-2">
                Importing students... {progress.current}/{progress.total}
              </p>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${percent}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-right">{percent}%</p>
            </div>
          )}

          {!loading && errorList.length > 0 && (
            <div className="bg-red-50 border border-red-300 text-red-700 p-3 rounded-md text-sm max-h-32 overflow-auto mb-3">
              <p className="font-medium mb-2">⚠️ Some rows failed to import:</p>
              <ul className="list-disc list-inside space-y-1">
                {errorList.map((err, index) => (
                  <li key={index}>
                    Row {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={loading || !file || !selectedSheets.length}
              className={`px-4 py-2 rounded-md text-white ${
                loading
                  ? "bg-gray-400"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Importing..." : "Upload & Import"}
            </button>
          </div>
        </div>
      </div>

      {/* Success Dialog */}
      {successDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-[10000]">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm shadow-lg text-center">
            <h3 className="text-green-700 text-lg font-semibold mb-2">
              Import Complete
            </h3>
            <p className="text-gray-700 mb-4">
              Successfully imported{" "}
              <strong>{progress.current}</strong> of{" "}
              <strong>{progress.total}</strong> students.
            </p>
            <button
              onClick={handleCloseSuccess}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ImportModal.jsx
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import * as XLSX from "xlsx";
import { db } from "../firebaseConfig";
import { collection, getDocs, setDoc, doc } from "firebase/firestore";

const ImportModal = ({ onClose, onImport }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [pendingData, setPendingData] = useState([]);
  const [selection, setSelection] = useState({});
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError("");
  };

  const parseExcel = async () => {
    if (!file) return setError("Please select an Excel file.");
    setLoading(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet);

      const students = rows.map((row) => ({
        id: String(row.ID || row.Id || row.id || "").trim(),
        firstName: row.FirstName || row["First Name"] || "",
        lastName: row.LastName || row["Last Name"] || "",
        year: row.Year || row["Year Level"] || "",
        rfid: String(row.RFID || row.rfid || "").trim(),
        contact: row.Contact || "",
        guardian: row.Guardian || "",
        guardianContact: row.GuardianContact || row["Guardian Contact"] || "",
      }));

      const snap = await getDocs(collection(db, "students"));
      const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const foundDuplicates = [];
      for (const student of students) {
        if (!student.id || !student.rfid) continue;
        const duplicate = existing.find(
          (s) => s.rfid === student.rfid && s.id !== student.id
        );
        if (duplicate) {
          foundDuplicates.push({ student, duplicate });
        }
      }

      if (foundDuplicates.length > 0) {
        setDuplicates(foundDuplicates);
        setPendingData(students);
        const defaultSelection = {};
        foundDuplicates.forEach(
          (d) => (defaultSelection[d.student.rfid] = false)
        );
        setSelection(defaultSelection);
        setLoading(false);
        return;
      }

      await saveStudents(students);
      setSummary({ imported: students.length, skipped: 0, overwritten: 0 });
    } catch (err) {
      console.error("Excel parsing error:", err);
      setError("Failed to parse Excel file.");
    }
    setLoading(false);
  };

  const saveStudents = async (students, selectedOverwrites = {}) => {
    let imported = 0;
    let overwritten = 0;
    let skipped = 0;

    try {
      for (const student of students) {
        if (!student.id) continue;

        const isDuplicate = duplicates.find(
          (d) => d.student.rfid === student.rfid
        );
        if (isDuplicate) {
          if (selectedOverwrites[student.rfid]) {
            await setDoc(doc(db, "students", student.id), student, { merge: true });
            overwritten++;
          } else {
            skipped++;
          }
        } else {
          await setDoc(doc(db, "students", student.id), student, { merge: true });
          imported++;
        }
      }

      setSummary({ imported, overwritten, skipped });
      onImport();
    } catch (err) {
      console.error("Error saving students:", err);
      setError("Error saving students to Firestore.");
    }
  };

  const handleConfirmDuplicates = async () => {
    await saveStudents(pendingData, selection);
    setDuplicates([]);
    setPendingData([]);
    setSelection({});
  };

  const toggleSelection = (rfid) => {
    setSelection((prev) => ({ ...prev, [rfid]: !prev[rfid] }));
  };

  // Auto-close after 3s when summary appears
  useEffect(() => {
    if (summary) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [summary, onClose]);

  if (!onClose) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Import Students from Excel</h2>

        {summary ? (
          <div className="space-y-4 text-center">
            <h3 className="text-lg font-semibold">✅ Import Complete</h3>
            <ul className="list-disc list-inside text-gray-700 text-left">
              <li>Imported: {summary.imported}</li>
              <li>Overwritten: {summary.overwritten}</li>
              <li>Skipped: {summary.skipped}</li>
            </ul>
            <p className="text-gray-500 text-sm">Closing automatically...</p>
            <div className="flex justify-center">
              <button
                onClick={onClose}
                className="mt-3 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Close now
              </button>
            </div>
          </div>
        ) : duplicates.length > 0 ? (
          <div className="space-y-4">
            <p className="text-red-600 font-medium">
              {duplicates.length} duplicate RFID(s) detected. Select which ones
              to overwrite:
            </p>
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-3 py-2">Overwrite?</th>
                  <th className="border px-3 py-2">RFID</th>
                  <th className="border px-3 py-2">Existing Student</th>
                  <th className="border px-3 py-2">New Student</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((d, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="border px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selection[d.student.rfid] || false}
                        onChange={() => toggleSelection(d.student.rfid)}
                      />
                    </td>
                    <td className="border px-3 py-2">{d.student.rfid}</td>
                    <td className="border px-3 py-2">
                      {d.duplicate.firstName} {d.duplicate.lastName} ({d.duplicate.id})
                    </td>
                    <td className="border px-3 py-2">
                      {d.student.firstName} {d.student.lastName} ({d.student.id})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDuplicates}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Confirm Import
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="w-full border p-2 rounded"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={parseExcel}
                disabled={loading}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ImportModal;

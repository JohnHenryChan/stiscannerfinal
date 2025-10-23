import React, { useState } from "react";
import * as XLSX from "xlsx";
import { db } from "../firebaseConfig";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

const ImportExcelModal = ({ visible, onClose }) => {
    const [file, setFile] = useState(null);
    const [sheets, setSheets] = useState([]);
    const [selectedSheets, setSelectedSheets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    // control which modal is shown
    const [showSelectionModal, setShowSelectionModal] = useState(true);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [showSummaryModal, setShowSummaryModal] = useState(false);

    // Duplicate scan + summary state
    const [duplicateSubjects, setDuplicateSubjects] = useState([]);
    // store duplicate students as objects: { id, name } so we can show names beside ids
    const [duplicateStudents, setDuplicateStudents] = useState([]);
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
    const [selectedImportMode, setSelectedImportMode] = useState("");
    const [summary, setSummary] = useState(null);
    const [summaryDetails, setSummaryDetails] = useState(null);
    const [errorList, setErrorList] = useState([]);

    // collapsible toggles for summary modal
    const [openSubjectsImported, setOpenSubjectsImported] = useState(false);
    const [openSubjectsOverwritten, setOpenSubjectsOverwritten] = useState(false);
    const [openSubjectsSkipped, setOpenSubjectsSkipped] = useState(false);
    const [openStudentsImported, setOpenStudentsImported] = useState(false);
    const [openStudentsOverwritten, setOpenStudentsOverwritten] = useState(false);
    const [openStudentsSkipped, setOpenStudentsSkipped] = useState(false);

    // helper to ensure buttons always show solid background (not outline-only)
    const solidBtnStyle = (bg, fg = "#ffffff", disabled = false) =>
        disabled
            ? { backgroundColor: "#e5e7eb", color: "#374151", border: "1px solid #d1d5db" }
            : { backgroundColor: bg, color: fg, border: "1px solid rgba(0,0,0,0.06)" };

    // ------------------ Helpers ------------------
    const clean = (obj) =>
        Object.fromEntries(
            Object.entries(obj).filter(
                ([, v]) =>
                    v !== undefined &&
                    v !== null &&
                    !(typeof v === "string" && v.trim() === "")
            )
        );

    const parseDays = (raw) => {
        if (!raw) return [];
        const t = String(raw).toUpperCase().replace(/\s+/g, "");
        if (t.includes("MWF")) return ["Mon", "Wed", "Fri"];
        if (t.includes("TTH") || t.includes("TTH")) return ["Tue", "Thu"];
        const days = [];
        if (t.includes("TH")) days.push("Thu");
        if (t.includes("M")) days.push("Mon");
        if (t.includes("T") && !t.includes("TH")) days.push("Tue");
        if (t.includes("W")) days.push("Wed");
        if (t.includes("F")) days.push("Fri");
        if (t.includes("SAT") || t === "S") days.push("Sat");
        if (t.includes("SUN")) days.push("Sun");
        return [...new Set(days)];
    };

    const parseTime = (timeStr) => {
        if (!timeStr) return undefined;
        const t0 = String(timeStr).trim();
        if (t0 === "") return undefined;
        const t = t0.toUpperCase().replace(/\s+/g, "");
        const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
        if (match24) {
            const hh = Number(match24[1]);
            const mm = match24[2].padStart(2, "0");
            return `${String(hh).padStart(2, "0")}:${mm}`;
        }
        const match = t.match(/^(\d{1,2}):?(\d{2})?(AM|PM)?$/i);
        if (!match) return undefined;
        let hours = parseInt(match[1], 10);
        const minutes = match[2] ? parseInt(match[2], 10) : 0;
        const ampm = match[3];
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    };

    const mapDigitToYear = (d) => {
        if (!d) return undefined;
        const digit = String(d).charAt(0);
        return digit === "1" ? "1st Year" :
               digit === "2" ? "2nd Year" :
               digit === "3" ? "3rd Year" :
               digit === "4" ? "4th Year" :
               undefined;
    };

    const parseStudentProgramYear = (row, fallbackProgram, fallbackYear) => {
        if (!Array.isArray(row)) return { program: fallbackProgram, year: fallbackYear };
        const cells = row.map((c) => (c === undefined || c === null) ? "" : String(c).trim());

        // Prefer columns O, P, Q, R (Excel cells 15O, 15P, 15Q, 15R) — zero-based indices 14..17
        const preferredIndices = [14, 15, 16, 17];

        let program = undefined;

        // 1) check preferred indices first (O-P-Q-R)
        for (const idx of preferredIndices) {
            const c = String(cells[idx] || "");
            if (!c) continue;
            const token = c.split(/\s+/)[0];
            if (/^[A-Za-z]{2,6}$/.test(token)) {
                program = token;
                break;
            }
        }

        // 2) fallback to other heuristic indices if not found in preferred columns
        if (!program) {
            const tryIndices = [11, 12, 13, 4, 5, 6, 10, 12, 13, 15, 16];
            for (const idx of tryIndices) {
                const c = String(cells[idx] || "");
                if (/^[A-Za-z]{2,6}$/.test(c)) {
                    program = c;
                    break;
                }
            }
        }

        if (!program) program = fallbackProgram;

        let year = undefined;
        // For year detection also prioritize preferred columns then fallback to full row scan
        for (const idx of preferredIndices) {
            const cell = String(cells[idx] || "").toUpperCase();
            if (!cell) continue;
            const mY = cell.match(/([1-4])\s*Y/);
            if (mY) { year = mapDigitToYear(mY[1]); break; }
            const mD = cell.match(/\b([1-4])\b/);
            if (mD) { year = mapDigitToYear(mD[1]); break; }
            const mAlt = cell.match(/^([1-4])Y?\d*$/);
            if (mAlt) { year = mapDigitToYear(mAlt[1]); break; }
        }

        if (!year) {
            for (const cell of cells) {
                if (!cell) continue;
                const s = cell.toUpperCase();
                const mY = s.match(/([1-4])\s*Y/);
                if (mY) { year = mapDigitToYear(mY[1]); break; }
                const mD = s.match(/\b([1-4])\b/);
                if (mD) { year = mapDigitToYear(mD[1]); break; }
                const mAlt = s.match(/^([1-4])Y?\d*$/);
                if (mAlt) { year = mapDigitToYear(mAlt[1]); break; }
            }
        }

        if (!year) year = fallbackYear;
        return { program, year };
    };

    const extractSubjectInfo = (rows) => {
        const headerRow = rows[6] || [];
        let subjectCode = "";
        let subjectName = "";
        let sectionName = "";
        let yearLevel = "";

        for (let i = 0; i < headerRow.length; i++) {
            const cellRaw = headerRow[i];
            if (cellRaw === undefined || cellRaw === null) continue;
            const cell = String(cellRaw).trim();

            if (!subjectCode && /^[A-Z]{1,}\d{2,}(-\w+)?$/i.test(cell)) {
                subjectCode = cell;
                continue;
            }

            if (!subjectName && cell.length > 4 && isNaN(cell)) {
                subjectName = cell;
                continue;
            }

            if (!sectionName && /^[A-Z0-9\s\-]+$/.test(cell) && /\d{2,}/.test(cell)) {
                if (/[A-Za-z]/.test(cell)) {
                    sectionName = cell;
                    const match = cell.match(/(\d{2,3})/);
                    if (match) {
                        const code = match[1][0];
                        yearLevel =
                            code === "1"
                                ? "1st Year"
                                : code === "2"
                                    ? "2nd Year"
                                    : code === "3"
                                        ? "3rd Year"
                                        : code === "4"
                                            ? "4th Year"
                                            : undefined;
                    }
                }
            }
        }

        if (!subjectCode) subjectCode = "UNKNOWN";
        if (!subjectName) subjectName = "Unnamed Subject";
        if (!sectionName) sectionName = "No Section";
        if (!yearLevel) yearLevel = undefined;
        return { subjectCode, subjectName, sectionName, yearLevel };
    };

    // Reset everything and close
    const resetAll = () => {
        setFile(null);
        setSheets([]);
        setSelectedSheets([]);
        setDuplicateSubjects([]);
        setDuplicateStudents([]);
        setShowDuplicatesModal(false);
        setSelectedImportMode("");
        setSummary(null);
        setSummaryDetails(null);
        setProgress({ current: 0, total: 0 });
        setLoading(false);
        setErrorList([]);
        setShowProgressModal(false);
        setShowSummaryModal(false);
        setShowSelectionModal(true);
        if (typeof onClose === "function") onClose();
    };

    // ------------------ File / sheet handlers ------------------
    const handleFileChange = (e) => {
        const uploaded = e.target.files[0];
        if (!uploaded) return;
        setFile(uploaded);

        const reader = new FileReader();
        reader.onload = (evt) => {
            const workbook = XLSX.read(evt.target.result, { type: "binary" });
            setSheets(workbook.SheetNames || []);
            setSelectedSheets([]);
        };
        reader.readAsBinaryString(uploaded);
    };

    const handleSheetToggle = (sheet) => {
        if (loading) return;
        setSelectedSheets((prev) =>
            prev.includes(sheet)
                ? prev.filter((s) => s !== sheet)
                : [...prev, sheet]
        );
    };

    // ------------------ Step 1: scan for duplicates ------------------
    const handleScan = async () => {
        if (!file || selectedSheets.length === 0) return;
        setLoading(true);
        setErrorList([]);
        setDuplicateSubjects([]);
        setDuplicateStudents([]);
        setShowDuplicatesModal(false);
        setSelectedImportMode("");

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const workbook = XLSX.read(e.target.result, { type: "array" });

                const foundSubjects = new Set();
                const foundStudents = new Set();
                const foundStudentNames = new Map(); // id -> name

                for (const sheetName of selectedSheets) {
                    const sheet = workbook.Sheets[sheetName];
                    if (!sheet) continue;
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    const { subjectCode } = extractSubjectInfo(rows);
                    if (subjectCode) foundSubjects.add(subjectCode);

                    const studentRows = rows.slice(14).filter((r) => r && r[1]);
                    studentRows.forEach((r) => {
                        const id = String(r[1] || "").trim();
                        if (id) {
                            foundStudents.add(id);
                            const fullname = String(r[3] || "").trim();
                            foundStudentNames.set(id, fullname);
                        }
                    });
                }

                const dupSubj = [];
                const dupStud = [];

                for (const code of foundSubjects) {
                    const ref = doc(db, "subjectList", code);
                    const snap = await getDoc(ref);
                    if (snap.exists()) dupSubj.push(code);
                }
                for (const id of foundStudents) {
                    const ref = doc(db, "students", id);
                    const snap = await getDoc(ref);
                    if (snap.exists()) {
                        dupStud.push({ id, name: foundStudentNames.get(id) || "" });
                    }
                }

                setDuplicateSubjects(dupSubj);
                setDuplicateStudents(dupStud);

                if (dupSubj.length || dupStud.length) {
                    setShowDuplicatesModal(true);
                } else {
                    // hide selection panel and show progress popup
                    setShowSelectionModal(false);
                    proceedImport("overwriteAll");
                }
            } catch (err) {
                console.error("Scan Error:", err);
                alert("Error reading file. Please check Excel format and structure.");
            } finally {
                setLoading(false);
            }
        };

        reader.readAsArrayBuffer(file);
    };

    // ------------------ Step 2: Import ------------------
    // show progress modal immediately when user confirms import mode
    const proceedImport = async (mode) => {
        if (!mode) return;
        setLoading(true);
        setShowDuplicatesModal(false);
        setSelectedImportMode(mode);
        setErrorList([]);
        // show separate progress popup and hide selection UI while importing
        setShowSelectionModal(false);
        setShowProgressModal(true);
        setShowSummaryModal(false);

        // arrays to store detailed records
        const subjectsImported = [];
        const subjectsOverwritten = [];
        const subjectsSkipped = [];
        const studentsImported = [];
        const studentsOverwritten = [];
        const studentsSkipped = [];

        let imported = 0; // students imported (excludes overwritten)
        let skipped = 0;
        let overwritten = 0;
        let totalStudentsToProcess = 0;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const workbook = XLSX.read(e.target.result, { type: "array" });

                // compute totals
                for (const sheetName of selectedSheets) {
                    const sheet = workbook.Sheets[sheetName];
                    if (!sheet) continue;
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    const studentRows = rows.slice(14).filter((r) => r && r[1]);
                    totalStudentsToProcess += studentRows.length;
                }
                setProgress({ current: 0, total: totalStudentsToProcess });

                let processedStudents = 0;

                for (const sheetName of selectedSheets) {
                    const sheet = workbook.Sheets[sheetName];
                    if (!sheet) continue;
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    const { subjectCode, subjectName, sectionName, yearLevel } = extractSubjectInfo(rows);

                    const fallbackSubjectName = String(rows[6]?.[5] || rows[6]?.[3] || "").trim();
                    const finalSubjectName = subjectName || fallbackSubjectName || "Unnamed Subject";

                    const finalSubjectCode = subjectCode || "UNKNOWN";
                    const finalSection = sectionName || String(rows[6]?.[17] || "").trim() || "No Section";
                    const subjectProgram = finalSection && finalSection !== "No Section" ? String(finalSection).split(/[\s\-]+/)[0] : undefined;
                    const subjectInferredYear = yearLevel || (/\b(1|2|3|4)\b/.test(finalSection) ? mapDigitToYear(finalSection.match(/(\d{1,3})/)[1].charAt(0)) : undefined);

                    const termRowSearch = (() => {
                        let termRaw = "";
                        for (let r = 0; r < Math.min(8, rows.length) && !termRaw; r++) {
                            const row = rows[r] || [];
                            for (let c = 0; c < (row.length || 0); c++) {
                                const cell = String(row[c] || "").trim();
                                if (/term|semester|sy/i.test(cell)) {
                                    termRaw = cell;
                                    break;
                                }
                            }
                        }
                        return termRaw;
                    })();

                    const years = String(termRowSearch).match(/\d{4}/g) || [];
                    const semester = /2(nd)?\s*(term|sem)/i.test(termRowSearch) ? "2nd Semester" : /1(st)?\s*(term|sem)/i.test(termRowSearch) ? "1st Semester" : undefined;
                    const schoolYearStart = years[0] || undefined;
                    const schoolYearEnd = years[1] || (schoolYearStart ? String(Number(schoolYearStart) + 1) : undefined);

                    const dayRow = rows[10] || [];
                    const rawDays = dayRow[0] || "";
                    const days = Array.isArray(parseDays(rawDays)) && parseDays(rawDays).length ? parseDays(rawDays) : undefined;
                    const timeRaw = String(dayRow[4] || "");
                    let startTime = undefined, endTime = undefined;
                    if (timeRaw && timeRaw.includes("-")) {
                        const parts = timeRaw.split("-").map((p) => p.trim());
                        startTime = parseTime(parts[0]);
                        endTime = parseTime(parts[1]);
                    } else if (timeRaw) {
                        const t = parseTime(timeRaw);
                        if (t) startTime = t;
                    }

                    const subjExists = duplicateSubjects.includes(finalSubjectCode);
                    // record subject actions
                    if (mode === "skipSubjectDupes" && subjExists) {
                        subjectsSkipped.push({
                            id: finalSubjectCode,
                            subject: finalSubjectName,
                            section: finalSection,
                        });
                        // when skipping subject, mark all its student rows as skipped
                        const studentRowsSkip = rows.slice(14).filter((r) => r && r[1]);
                        studentRowsSkip.forEach((r) => {
                            const sid = String(r[1] || "").trim();
                            const sname = String(r[3] || "").trim();
                            studentsSkipped.push({ id: sid, name: sname, subject: finalSubjectCode });
                        });
                        skipped += studentRowsSkip.length;
                        processedStudents += studentRowsSkip.length;
                        setProgress({ current: processedStudents, total: totalStudentsToProcess });
                        continue;
                    }

                    if (subjExists && mode === "overwriteAll") {
                        subjectsOverwritten.push({
                            id: finalSubjectCode,
                            subject: finalSubjectName,
                            section: finalSection,
                        });
                        overwritten++;
                    }

                    if (!subjExists) {
                        // new subject
                        subjectsImported.push({
                            id: finalSubjectCode,
                            subject: finalSubjectName,
                            section: finalSection,
                        });
                    }

                    const subjectData = clean({
                        id: finalSubjectCode,
                        subjectCode: finalSubjectCode,
                        subject: finalSubjectName,
                        program: subjectProgram,
                        yearLevel: subjectInferredYear,
                        semester: semester,
                        days: days,
                        startTime: startTime,
                        endTime: endTime,
                        schoolYearStart: schoolYearStart,
                        schoolYearEnd: schoolYearEnd,
                        active: true,
                        createdAt: serverTimestamp(),
                    });

                    await setDoc(doc(db, "subjectList", finalSubjectCode), subjectData, { merge: true });

                    const studentRows = rows.slice(14).filter((r) => r && r[1]);
                    for (const row of studentRows) {
                        const studentId = String(row[1] || "").trim();
                        if (!studentId) {
                            processedStudents++;
                            setProgress({ current: processedStudents, total: totalStudentsToProcess });
                            continue;
                        }
                        // duplicateStudents is array of {id,name}
                        const dupEntry = duplicateStudents.find((s) => s.id === studentId);
                        const studExists = !!dupEntry;
                        if (mode === "skipStudentDupes" && studExists) {
                            // skipped student
                            const sname = dupEntry?.name || String(row[3] || "").trim();
                            studentsSkipped.push({ id: studentId, name: sname, subject: finalSubjectCode });
                            skipped++;
                            processedStudents++;
                            setProgress({ current: processedStudents, total: totalStudentsToProcess });
                            continue;
                        }
                        if (studExists && mode === "overwriteAll") {
                            // overwritten student (do not count as imported)
                            const sname = dupEntry?.name || String(row[3] || "").trim();
                            studentsOverwritten.push({ id: studentId, name: sname, subject: finalSubjectCode });
                            overwritten++;
                            // still update record
                        } else if (!studExists) {
                            const sname = String(row[3] || "").trim();
                            studentsImported.push({ id: studentId, name: sname, subject: finalSubjectCode });
                            imported++;
                        }

                        const fullName = String(row[3] || "").trim();
                        const [lastNameRaw, firstNameRaw] = fullName.split(",").map((s) => s && s.trim()) || [];
                        const lastName = lastNameRaw || "";
                        const firstName = firstNameRaw || "";

                        const { program: programPerStudent, year: yearPerStudent } = parseStudentProgramYear(row, subjectProgram, subjectInferredYear);

                        const studentData = clean({
                            id: studentId,
                            firstName: firstName,
                            lastName: lastName,
                            program: programPerStudent,
                            year: yearPerStudent,
                            updatedAt: serverTimestamp(),
                        });

                        await setDoc(doc(db, "students", studentId), studentData, { merge: true });

                        // subject subcollection doc contains only { id }
                        await setDoc(doc(db, "subjectList", finalSubjectCode, "students", studentId), { id: studentId });

                        processedStudents++;
                        setProgress({ current: processedStudents, total: totalStudentsToProcess });
                    }
                }

                // build summary counts (students imported excludes overwritten)
                const summaryObj = {
                    studentsImportedCount: imported,
                    studentsSkippedCount: skipped,
                    studentsOverwrittenCount: studentsOverwritten.length,
                    subjectsImportedCount: subjectsImported.length,
                    subjectsSkippedCount: subjectsSkipped.length,
                    subjectsOverwrittenCount: subjectsOverwritten.length,
                    totalStudentsProcessed: totalStudentsToProcess,
                };

                setSummary(summaryObj);
                setSummaryDetails({
                    subjectsImported,
                    subjectsOverwritten,
                    subjectsSkipped,
                    studentsImported,
                    studentsOverwritten,
                    studentsSkipped,
                });

                // show summary modal (close progress)
                setShowProgressModal(false);
                setShowSummaryModal(true);
            } catch (err) {
                console.error("Import Error:", err);
                setErrorList([err.message || String(err)]);
                // leave progress modal open so user sees error
            } finally {
                setLoading(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // ------------------ UI Rendering ------------------
    if (!visible) return null;

    const primaryButtonDisabled = !file || selectedSheets.length === 0 || loading;

    // keep selection modal hidden while progress or summary modals are visible
    const renderSelection = showSelectionModal && !showProgressModal && !showSummaryModal;

    return (
        <>
            {/* Selection Modal */}
            {renderSelection && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-40">
                    <div className="bg-white rounded-lg shadow-lg w-[600px] max-h-[90vh] overflow-y-auto p-6">
                        <h2 className="text-xl font-semibold mb-4">Import Excel</h2>

                        {/* File upload */}
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            className="mb-4 w-full border p-2 rounded"
                            disabled={loading}
                        />

                        {/* Sheet selection */}
                        {sheets.length > 0 && (
                            <div className="mb-4">
                                <h3 className="font-medium mb-2">Select Sheets to Import:</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {sheets.map((s) => (
                                        <label
                                            key={s}
                                            className={`flex items-center space-x-2 border p-2 rounded ${selectedSheets.includes(s) ? "bg-blue-50 border-blue-300" : "bg-white"} `}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedSheets.includes(s)}
                                                onChange={() => handleSheetToggle(s)}
                                                disabled={loading}
                                            />
                                            <span className="text-gray-800">{s}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Buttons (always visible) */}
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => {
                                    // close whole flow
                                    resetAll();
                                }}
                                style={solidBtnStyle("#e5e7eb", "#374151", loading)}
                                className="px-4 py-2 rounded focus:outline-none"
                                disabled={loading}
                            >
                                Cancel
                            </button>

                            <button
                                onClick={() => {
                                    // scan first; if no duplicates proceedImport will hide selection and show progress
                                    handleScan();
                                }}
                                style={solidBtnStyle("#2563eb", "#ffffff", primaryButtonDisabled)}
                                className="px-4 py-2 rounded focus:outline-none"
                                disabled={primaryButtonDisabled}
                            >
                                {loading ? "Scanning..." : "Scan for Duplicates"}
                            </button>
                        </div>

                        {/* Errors */}
                        {errorList.length > 0 && (
                            <div className="mt-4 text-red-600 text-sm">
                                <strong>Errors:</strong>
                                <ul className="list-disc list-inside">
                                    {errorList.map((err, idx) => (
                                        <li key={idx}>{err}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Duplicate Modal (over selection) */}
            {showDuplicatesModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-[520px] shadow-lg">
                        <h3 className="text-lg font-semibold mb-3">Duplicates Detected</h3>
                        <div className="max-h-[300px] overflow-y-auto text-sm">
                            {duplicateSubjects.length > 0 && (
                                <div className="mb-3">
                                    <h4 className="font-medium text-gray-800 mb-1">
                                        Subjects already exist:
                                    </h4>
                                    <ul className="list-disc list-inside text-gray-700">
                                        {duplicateSubjects.map((s) => (
                                            <li key={s}>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {duplicateStudents.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-gray-800 mb-1">
                                        Students already exist:
                                    </h4>
                                    <ul className="list-disc list-inside text-gray-700">
                                        {duplicateStudents.map((s) => (
                                            <li key={s.id}>
                                                <span className="font-medium">{s.id}</span>
                                                {s.name ? <span className="text-gray-600"> — {s.name}</span> : null}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* action buttons */}
                        <div className="mt-5 space-y-2">
                            <button
                                onClick={() => {
                                    setShowSelectionModal(false);
                                    proceedImport("overwriteAll");
                                }}
                                style={solidBtnStyle("#dc2626", "#ffffff", loading)}
                                className="w-full py-2 rounded focus:outline-none"
                                disabled={loading}
                            >
                                Overwrite All Duplicates
                            </button>

                            <button
                                onClick={() => {
                                    setShowSelectionModal(false);
                                    proceedImport("skipStudentDupes");
                                }}
                                style={solidBtnStyle("#f59e0b", "#ffffff", loading)}
                                className="w-full py-2 rounded focus:outline-none"
                                disabled={loading}
                            >
                                Skip Existing Students
                            </button>

                            <button
                                onClick={() => {
                                    setShowSelectionModal(false);
                                    proceedImport("skipSubjectDupes");
                                }}
                                style={solidBtnStyle("#2563eb", "#ffffff", loading)}
                                className="w-full py-2 rounded focus:outline-none"
                                disabled={loading}
                            >
                                Skip Existing Subjects
                            </button>

                            <button
                                onClick={() => setShowDuplicatesModal(false)}
                                style={solidBtnStyle("#e5e7eb", "#374151", loading)}
                                className="w-full py-2 rounded focus:outline-none"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress Modal (separate popup) */}
            {showProgressModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-60">
                    <div className="bg-white rounded-lg p-6 w-[480px] shadow-lg text-center">
                        <h3 className="text-lg font-semibold mb-3">Importing...</h3>

                        <div className="text-sm mb-3 text-gray-700">
                            Mode: <span className="font-medium">{selectedImportMode || "import"}</span>
                        </div>

                        <div className="text-sm mb-3 text-gray-700">
                            Processing {progress.current} / {progress.total}
                        </div>

                        <div className="w-full bg-gray-200 rounded h-3 mb-4">
                            <div
                                className="h-3 rounded transition-all"
                                style={{
                                    backgroundColor: "#10b981",
                                    width: `${progress.total > 0 ? Math.min((progress.current / progress.total) * 100, 100) : 0}%`,
                                }}
                            />
                        </div>

                        <div className="flex justify-center space-x-2">
                            {/* Cancel is disabled during import to avoid partial state; still visible */}
                            <button
                                onClick={() => {}}
                                style={solidBtnStyle("#e5e7eb", "#374151", true)}
                                className="px-4 py-2 rounded focus:outline-none"
                                disabled
                            >
                                Cancel
                            </button>

                            <button
                                onClick={() => {
                                    // allow user to close progress modal only when not loading
                                    if (!loading) {
                                        setShowProgressModal(false);
                                        // show selection again if desired (user can import again)
                                        setShowSelectionModal(true);
                                    }
                                }}
                                style={solidBtnStyle("#2563eb", "#ffffff", loading)}
                                className="px-4 py-2 rounded focus:outline-none"
                                disabled={loading}
                            >
                                {loading ? "Working..." : "Close"}
                            </button>
                        </div>

                        {/* show any errors inside progress modal so it's visible to user */}
                        {errorList.length > 0 && (
                            <div className="mt-4 text-red-600 text-sm text-left">
                                <strong>Errors:</strong>
                                <ul className="list-disc list-inside">
                                    {errorList.map((err, idx) => (
                                        <li key={idx}>{err}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Summary Modal (separate) */}
            {showSummaryModal && summary && summaryDetails && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-70">
                    <div className="bg-white rounded-lg p-6 w-[640px] max-h-[80vh] overflow-y-auto shadow-lg">
                        <h3 className="text-lg font-semibold mb-3">Import Summary</h3>

                        <div className="grid grid-cols-3 gap-4 text-sm text-gray-700 mb-4">
                            <div>
                                <div className="font-medium">Subjects Imported</div>
                                <div className="text-gray-600">{summary.subjectsImportedCount}</div>
                            </div>
                            <div>
                                <div className="font-medium">Subjects Overwritten</div>
                                <div className="text-gray-600">{summary.subjectsOverwrittenCount}</div>
                            </div>
                            <div>
                                <div className="font-medium">Subjects Skipped</div>
                                <div className="text-gray-600">{summary.subjectsSkippedCount}</div>
                            </div>

                            <div>
                                <div className="font-medium">Students Imported</div>
                                <div className="text-gray-600">{summary.studentsImportedCount}</div>
                            </div>
                            <div>
                                <div className="font-medium">Students Overwritten</div>
                                <div className="text-gray-600">{summary.studentsOverwrittenCount}</div>
                            </div>
                            <div>
                                <div className="font-medium">Students Skipped</div>
                                <div className="text-gray-600">{summary.studentsSkippedCount}</div>
                            </div>
                        </div>

                        {/* Collapsible sections */}
                        <div className="space-y-3 mb-4">
                            {/* Subjects Imported */}
                            <div>
                                <button
                                    className="w-full text-left px-3 py-2 bg-gray-100 rounded flex justify-between items-center"
                                    onClick={() => setOpenSubjectsImported((s) => !s)}
                                >
                                    <span>Subjects Imported ({summary.subjectsImportedCount})</span>
                                    <span>{openSubjectsImported ? "▾" : "▸"}</span>
                                </button>
                                {openSubjectsImported && (
                                    <ul className="mt-2 max-h-40 overflow-y-auto border rounded p-2 bg-white text-sm">
                                        {summaryDetails.subjectsImported.length > 0 ? (
                                            summaryDetails.subjectsImported.map((s, i) => (
                                                <li key={i} className="py-1 border-b last:border-b-0">
                                                    <div className="font-medium">{s.id} — {s.subject}</div>
                                                    <div className="text-gray-600 text-xs">Section: {s.section}</div>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-gray-500">None</li>
                                        )}
                                    </ul>
                                )}
                            </div>

                            {/* Subjects Overwritten */}
                            <div>
                                <button
                                    className="w-full text-left px-3 py-2 bg-gray-100 rounded flex justify-between items-center"
                                    onClick={() => setOpenSubjectsOverwritten((s) => !s)}
                                >
                                    <span>Subjects Overwritten ({summary.subjectsOverwrittenCount})</span>
                                    <span>{openSubjectsOverwritten ? "▾" : "▸"}</span>
                                </button>
                                {openSubjectsOverwritten && (
                                    <ul className="mt-2 max-h-40 overflow-y-auto border rounded p-2 bg-white text-sm">
                                        {summaryDetails.subjectsOverwritten.length > 0 ? (
                                            summaryDetails.subjectsOverwritten.map((s, i) => (
                                                <li key={i} className="py-1 border-b last:border-b-0">
                                                    <div className="font-medium">{s.id} — {s.subject}</div>
                                                    <div className="text-gray-600 text-xs">Section: {s.section}</div>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-gray-500">None</li>
                                        )}
                                    </ul>
                                )}
                            </div>

                            {/* Subjects Skipped */}
                            <div>
                                <button
                                    className="w-full text-left px-3 py-2 bg-gray-100 rounded flex justify-between items-center"
                                    onClick={() => setOpenSubjectsSkipped((s) => !s)}
                                >
                                    <span>Subjects Skipped ({summary.subjectsSkippedCount})</span>
                                    <span>{openSubjectsSkipped ? "▾" : "▸"}</span>
                                </button>
                                {openSubjectsSkipped && (
                                    <ul className="mt-2 max-h-40 overflow-y-auto border rounded p-2 bg-white text-sm">
                                        {summaryDetails.subjectsSkipped.length > 0 ? (
                                            summaryDetails.subjectsSkipped.map((s, i) => (
                                                <li key={i} className="py-1 border-b last:border-b-0">
                                                    <div className="font-medium">{s.id} — {s.subject}</div>
                                                    <div className="text-gray-600 text-xs">Section: {s.section}</div>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-gray-500">None</li>
                                        )}
                                    </ul>
                                )}
                            </div>

                            {/* Students Imported */}
                            <div>
                                <button
                                    className="w-full text-left px-3 py-2 bg-gray-100 rounded flex justify-between items-center"
                                    onClick={() => setOpenStudentsImported((s) => !s)}
                                >
                                    <span>Students Imported ({summary.studentsImportedCount})</span>
                                    <span>{openStudentsImported ? "▾" : "▸"}</span>
                                </button>
                                {openStudentsImported && (
                                    <ul className="mt-2 max-h-48 overflow-y-auto border rounded p-2 bg-white text-sm">
                                        {summaryDetails.studentsImported.length > 0 ? (
                                            summaryDetails.studentsImported.map((st, i) => (
                                                <li key={i} className="py-1 border-b last:border-b-0">
                                                    <div className="font-medium">{st.id} — {st.name || "Unnamed"}</div>
                                                    <div className="text-gray-600 text-xs">Subject: {st.subject}</div>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-gray-500">None</li>
                                        )}
                                    </ul>
                                )}
                            </div>

                            {/* Students Overwritten */}
                            <div>
                                <button
                                    className="w-full text-left px-3 py-2 bg-gray-100 rounded flex justify-between items-center"
                                    onClick={() => setOpenStudentsOverwritten((s) => !s)}
                                >
                                    <span>Students Overwritten ({summary.studentsOverwrittenCount})</span>
                                    <span>{openStudentsOverwritten ? "▾" : "▸"}</span>
                                </button>
                                {openStudentsOverwritten && (
                                    <ul className="mt-2 max-h-48 overflow-y-auto border rounded p-2 bg-white text-sm">
                                        {summaryDetails.studentsOverwritten.length > 0 ? (
                                            summaryDetails.studentsOverwritten.map((st, i) => (
                                                <li key={i} className="py-1 border-b last:border-b-0">
                                                    <div className="font-medium">{st.id} — {st.name || "Unnamed"}</div>
                                                    <div className="text-gray-600 text-xs">Subject: {st.subject}</div>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-gray-500">None</li>
                                        )}
                                    </ul>
                                )}
                            </div>

                            {/* Students Skipped */}
                            <div>
                                <button
                                    className="w-full text-left px-3 py-2 bg-gray-100 rounded flex justify-between items-center"
                                    onClick={() => setOpenStudentsSkipped((s) => !s)}
                                >
                                    <span>Students Skipped ({summary.studentsSkippedCount})</span>
                                    <span>{openStudentsSkipped ? "▾" : "▸"}</span>
                                </button>
                                {openStudentsSkipped && (
                                    <ul className="mt-2 max-h-48 overflow-y-auto border rounded p-2 bg-white text-sm">
                                        {summaryDetails.studentsSkipped.length > 0 ? (
                                            summaryDetails.studentsSkipped.map((st, i) => (
                                                <li key={i} className="py-1 border-b last:border-b-0">
                                                    <div className="font-medium">{st.id} — {st.name || "Unnamed"}</div>
                                                    <div className="text-gray-600 text-xs">Subject: {st.subject}</div>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-gray-500">None</li>
                                        )}
                                    </ul>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    // keep summary open but allow user to close and re-import if desired
                                    setShowSummaryModal(false);
                                    setShowSelectionModal(true);
                                }}
                                className="px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                            >
                                Close
                            </button>

                            <button
                                onClick={() => {
                                    resetAll();
                                }}
                                className="px-4 py-2 rounded bg-blue-700 text-white hover:bg-blue-900"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ImportExcelModal;
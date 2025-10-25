import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { collection, doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig.js";

const YEARS = Array.from({ length: 16 }, (_, i) => String(2020 + i)); // 2020..2035

const Subject = ({ visible, onClose, onSubmit, initialData }) => {
  const [formData, setFormData] = useState({
    program: "",
    subject: "",
    subjectCode: "",
    yearLevel: "",
    startTime: "",
    endTime: "",
    days: [],
    schoolYearStart: "",
    schoolYearEnd: "",
    semester: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const docSub = collection(db, "subjectList");

  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const startRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (startRef.current && !startRef.current.contains(e.target)) setStartOpen(false);
      if (endRef.current && !endRef.current.contains(e.target)) setEndOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (visible) {
      let safeData = initialData ? { ...initialData } : {};

      safeData.days = Array.isArray(safeData.days)
        ? safeData.days
        : safeData.days
        ? [safeData.days]
        : [];

      // allow entering longer but sanitize to alnum and uppercase letters; allow up to 12 chars so user can exceed 8
      safeData.subjectCode = (safeData.subjectCode || "")
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 12)
        .replace(/[a-z]/g, (c) => c.toUpperCase());

      // Normalize school years to allowed range and auto-fill paired year
      const startVal = safeData.schoolYearStart ? String(safeData.schoolYearStart) : "";
      const endVal = safeData.schoolYearEnd ? String(safeData.schoolYearEnd) : "";
      let s = startVal;
      let e = endVal;
      if (s && !YEARS.includes(s)) {
        // clamp into range
        const sNum = Math.max(2020, Math.min(2035, Number(s)));
        s = String(sNum);
      }
      if (e && !YEARS.includes(e)) {
        const eNum = Math.max(2020, Math.min(2035, Number(e)));
        e = String(eNum);
      }
      if (s && !e) {
        const next = Math.min(2035, Number(s) + 1);
        e = String(next);
      }
      if (e && !s) {
        const prev = Math.max(2020, Number(e) - 1);
        s = String(prev);
      }
      safeData.schoolYearStart = s || "";
      safeData.schoolYearEnd = e || "";

      setFormData({
        program: safeData.program || "",
        subject: safeData.subject || "",
        subjectCode: safeData.subjectCode || "",
        yearLevel: safeData.yearLevel || "",
        startTime: safeData.startTime || "",
        endTime: safeData.endTime || "",
        days: safeData.days,
        schoolYearStart: safeData.schoolYearStart || "",
        schoolYearEnd: safeData.schoolYearEnd || "",
        semester: safeData.semester || "",
      });
      setErrorMessage("");
    }
  }, [visible, initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Program: letters-only, auto-uppercase, max 4 chars enforced during typing
    if (name === "program") {
      const lettersOnly = value.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
      setFormData((prev) => ({ ...prev, program: lettersOnly }));
      setErrorMessage("");
      return;
    }

    // subjectCode: allow alnum, uppercase letters, up to 12 chars (permit >8 for warning case)
    if (name === "subjectCode") {
      const sanitized = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
      const upper = sanitized.replace(/[a-z]/g, (c) => c.toUpperCase());
      setFormData((prev) => ({ ...prev, subjectCode: upper }));
      setErrorMessage("");
      return;
    }

    // keep generic handling for other fields (school year handled by selectors below)
    setFormData((prev) => ({ ...prev, [name]: value }));

    setErrorMessage("");
  };

  // Handlers for school year select -> auto-fill paired year and clamp within 2020-2035
  const handleSchoolYearStartChange = (val) => {
    if (!val) {
      // clearing start should also clear end
      setFormData((prev) => ({ ...prev, schoolYearStart: "", schoolYearEnd: "" }));
      return;
    }
    const startNum = Math.max(2020, Math.min(2035, Number(val)));
    const endNum = Math.min(2035, startNum + 1);
    setFormData((prev) => ({
      ...prev,
      schoolYearStart: String(startNum),
      schoolYearEnd: String(endNum),
    }));
  };

  const handleSchoolYearEndChange = (val) => {
    if (!val) {
      setFormData((prev) => ({ ...prev, schoolYearStart: "", schoolYearEnd: "" }));
      return;
    }
    const endNum = Math.max(2020, Math.min(2035, Number(val)));
    const startNum = Math.max(2020, endNum - 1);
    setFormData((prev) => ({
      ...prev,
      schoolYearStart: String(startNum),
      schoolYearEnd: String(endNum),
    }));
  };

  const handleDayToggle = (day) => {
    setFormData((prev) => {
      const updatedDays = prev.days?.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...(prev.days || []), day];
      return { ...prev, days: updatedDays };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    const {
      program,
      subject,
      subjectCode,
      yearLevel,
      startTime,
      endTime,
      days,
      schoolYearStart,
      schoolYearEnd,
      semester,
    } = formData;

    if (!program || !subject || !subjectCode || !yearLevel || !semester) {
      setErrorMessage("Please fill in all required fields (Program, Subject, Code, Year, Semester).");
      return;
    }

    // Leading letters at start
    const leadingLettersMatch = (subjectCode || "").match(/^[A-Za-z]*/);
    const leadingLetters = leadingLettersMatch ? leadingLettersMatch[0] : "";
    const leadingLettersCount = leadingLetters.length;

    // Block: must have at least 4 leading letters
    if (leadingLettersCount < 4) {
      setErrorMessage("Invalid Subject Code format.");
      return;
    }

    // ensure there exists exactly 4 digits immediately following the initial letters:
    const altMatch = (subjectCode || "").match(/^([A-Za-z]+)(\d{4})([A-Za-z0-9]*)$/);
    if (!altMatch) {
      setErrorMessage("Invalid Subject Code format.");
      return;
    }

    // format and change warnings
    const strictStandard = /^[A-Za-z]{4}\d{4}$/;
    const formatWarning = !strictStandard.test(subjectCode);
    const codeChanged = Boolean(initialData && initialData.subjectCode && initialData.subjectCode !== subjectCode);
    const hasWarning = formatWarning || codeChanged;

    // NOTE: no inline warning message displayed here (redundant warnings removed).
    // format/code-change still signal parent via `hasWarning` so ConfirmModal can run.

    // SCHOOL YEAR & TIME validation (unchanged)
    // School year validation (start earlier than end and end = start + 1)
    if ((schoolYearStart && !schoolYearEnd) || (!schoolYearStart && schoolYearEnd)) {
      setErrorMessage("Please provide both Start Year and End Year, or leave both empty.");
      return;
    }
    if (schoolYearStart && schoolYearEnd) {
      if (!/^[0-9]{4}$/.test(schoolYearStart) || !/^[0-9]{4}$/.test(schoolYearEnd)) {
        setErrorMessage("School years must be 4-digit numbers (e.g. 2024).");
        return;
      }
      const startNum = parseInt(schoolYearStart, 10);
      const endNum = parseInt(schoolYearEnd, 10);
      if (startNum >= endNum) {
        setErrorMessage("Start Year must be earlier than End Year.");
        return;
      }
      if (endNum !== startNum + 1) {
        setErrorMessage("End Year must be exactly Start Year + 1.");
        return;
      }
    }

    // Time validation
    if ((startTime && !endTime) || (!startTime && endTime)) {
      setErrorMessage("Please provide both start time and end time, or leave both empty.");
      return;
    }
    if (startTime && endTime) {
      const toMinutes = (t) => {
        const [hh, mm] = t.split(":").map((n) => parseInt(n, 10));
        return hh * 60 + mm;
      };
      const startMin = toMinutes(startTime);
      const endMin = toMinutes(endTime);
      const earliest = 7 * 60;
      const latest = 18 * 60;
      if (!(startMin >= earliest && startMin <= latest && endMin >= earliest && endMin <= latest)) {
        setErrorMessage("Start and end times must be between 07:00 and 18:00.");
        return;
      }
      if (startMin >= endMin) {
        setErrorMessage("Start time must be before end time.");
        return;
      }
      if (endMin - startMin > 180) {
        setErrorMessage("Duration cannot exceed 3 hours.");
        return;
      }
    }

    // DUPLICATE CHECK — now sets blocking errorMessage (no inline warnings)
    try {
      const targetRef = doc(db, "subjectList", subjectCode);
      const targetSnap = await getDoc(targetRef);

      // Creating new subject -> duplicate blocks
      if (!initialData && targetSnap.exists()) {
        setErrorMessage("A subject with that code already exists. Please pick a different code or edit the existing subject.");
        return;
      }

      // Editing and changing code -> duplicate blocks
      if (initialData && codeChanged && targetSnap.exists()) {
        setErrorMessage("A subject with that code already exists. Please pick a different code or edit the existing subject.");
        return;
      }
    } catch (err) {
      console.warn("Duplicate check failed:", err);
      // don't block submit on network error; leave a non-blocking console warning
    }

    // Pass warning flag to parent. If there is a non-blocking warning, parent should show ConfirmModal.
    if (typeof onSubmit === "function") {
      onSubmit(formData, hasWarning);
    }
    if (!hasWarning) {
      onClose();
    }
  };

  const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (!visible) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm z-[9999]">
      <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-lg">
        <h2 className="text-xl font-semibold mb-4">
          {initialData ? "Update Subject" : "Add Subject"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            name="program"
            placeholder="Program"
            value={formData.program}
            onChange={handleChange}
            className="w-full border rounded-md p-2"
            maxLength={4}
          />
          <input
            type="text"
            name="subject"
            placeholder="Subject"
            value={formData.subject}
            onChange={handleChange}
            className="w-full border rounded-md p-2"
          />

          {/* Subject Code input (inline warnings removed) */}
          <div className="relative">
            <input
              type="text"
              name="subjectCode"
              placeholder="Subject Code"
              value={formData.subjectCode}
              onChange={handleChange}
              className="w-full border rounded-md p-2 pr-2"
            />
          </div>

          <select
            name="yearLevel"
            value={formData.yearLevel}
            onChange={handleChange}
            className="w-full border rounded-md p-2"
          >
            <option value="">Select Year Level</option>
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
          </select>

          <div className="flex gap-2">
            <div className="w-1/2" ref={startRef}>
              <label className="block text-sm text-gray-600 mb-1">Start Year</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setStartOpen((s) => !s); setEndOpen(false); }}
                  className="w-full text-left border rounded-md p-2 bg-white"
                >
                  {formData.schoolYearStart || "—"}
                </button>

                {startOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white border rounded shadow max-h-40 overflow-y-auto z-50">
                    {YEARS.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          handleSchoolYearStartChange(y);
                          setStartOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100"
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="w-1/2" ref={endRef}>
              <label className="block text-sm text-gray-600 mb-1">End Year</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setEndOpen((s) => !s); setStartOpen(false); }}
                  className="w-full text-left border rounded-md p-2 bg-white"
                >
                  {formData.schoolYearEnd || "—"}
                </button>

                {endOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white border rounded shadow max-h-40 overflow-y-auto z-50">
                    {YEARS.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          handleSchoolYearEndChange(y);
                          setEndOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100"
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <select
            name="semester"
            value={formData.semester}
            onChange={handleChange}
            className="w-full border rounded-md p-2"
          >
            <option value="">Select Semester</option>
            <option value="1st Semester">1st Semester</option>
            <option value="2nd Semester">2nd Semester</option>
          </select>

          <div className="flex gap-2">
            <input
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleChange}
              min="07:00"
              max="18:00"
              className="w-full border rounded-md p-2"
            />
            <input
              type="time"
              name="endTime"
              value={formData.endTime}
              onChange={handleChange}
              min="07:00"
              max="18:00"
              className="w-full border rounded-md p-2"
            />
          </div>

          <div>
            <p className="font-medium mt-3">Tap to Toggle Days :</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {daysOfWeek.map((day) => (
                <button
                  type="button"
                  key={day}
                  onClick={() => handleDayToggle(day)}
                  className={`px-3 py-1 rounded-md border transition-colors duration-150 ${
                    formData.days?.includes(day)
                      ? "bg-blue-700 text-white border-blue-800 hover:bg-blue-800"
                      : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Blocking error message shown under textbox in red */}
          {errorMessage && <p className="text-red-600 text-sm">{errorMessage}</p>}

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-600 text-white font-medium px-6 py-2 rounded-md hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-blue-700 text-white font-medium px-6 py-2 rounded-md hover:bg-blue-800"
            >
              {initialData ? "Update" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default Subject;

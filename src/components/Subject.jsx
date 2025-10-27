import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { collection, doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig.js";

const YEARS = Array.from({ length: 16 }, (_, i) => String(2020 + i)); // 2020..2035

const Subject = ({ visible, onClose, onSubmit, initialData }) => {
  const startRef = useRef(null);
  const endRef = useRef(null);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

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
  const [subjectCodeWarning, setSubjectCodeWarning] = useState(false);
  const [allowProceedWarnings, setAllowProceedWarnings] = useState(false);
  const docSub = collection(db, "subjectList");

  // Helper functions for validation
  const isSubjectCodeValid = (code) => {
    if (!code) return true; // empty is handled elsewhere
    return /^[A-Za-z]{4,}\d{4}$/.test(code);
  };

  const getSubjectCodeError = (code) => {
    if (!code) return null;
    const letters = code.match(/^[A-Za-z]+/)?.[0] || "";
    const digits = code.match(/\d+$/)?.[0] || "";
    
    if (letters.length < 4) return "Must have at least 4 leading letters";
    if (digits.length !== 4) return "Must end with exactly 4 digits";
    if (code.length !== letters.length + digits.length) return "Cannot mix letters and digits";
    return null;
  };

  const getTimeError = (start, end) => {
    if (!start && !end) return null;
    if (!start || !end) return "Both start and end times required";

    const toMinutes = (t) => {
      const [hh, mm] = t.split(":").map(n => parseInt(n, 10));
      return hh * 60 + mm;
    };

    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    const earliest = 7 * 60; // 7:00
    const latest = 18 * 60; // 18:00

    if (startMin < earliest || startMin > latest) 
      return "Start time must be between 07:00-18:00";
    if (endMin < earliest || endMin > latest)
      return "End time must be between 07:00-18:00";
    if (startMin >= endMin)
      return "Start time must be before end time";
    if (endMin - startMin > 180)
      return "Duration cannot exceed 3 hours";
    
    return null;
  };

  // Render warning icons with expandable tooltips
  const renderSubjectCodeIcon = () => {
    const code = formData.subjectCode;
    if (!code) return null;

    const error = getSubjectCodeError(code);
    if (error) {
      return (
        <div className="relative inline-flex group">
          <span className="text-red-500">❗</span>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 w-64 p-2 bg-white rounded-md shadow-lg border border-gray-200">
            <div className="text-red-600 font-medium mb-1">Invalid Format</div>
            <div className="text-sm">{error}</div>
          </div>
        </div>
      );
    }

    const letters = code.match(/^[A-Za-z]+/)?.[0] || "";
    if (letters.length > 4) {
      return (
        <div className="relative inline-flex group">
          <span className="text-yellow-500">⚠️</span>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 w-64 p-2 bg-white rounded-md shadow-lg border border-gray-200">
            <div className="text-yellow-600 font-medium mb-1">Non-standard Format</div>
            <div className="text-sm">Subject code has more than 4 leading letters</div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderTimeIcon = () => {
    const error = getTimeError(formData.startTime, formData.endTime);
    if (!error) return null;

    return (
      <div className="relative inline-flex group">
        <span className="text-red-500">❗</span>
        <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 w-64 p-2 bg-white rounded-md shadow-lg border border-gray-200">
          <div className="text-red-600 font-medium mb-1">Invalid Time</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    );
  };

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
      // Reset dropdown states when modal opens/closes
      setStartOpen(false);
      setEndOpen(false);
      
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
      // update warning flag based on restored code
      const leadingMatch = (safeData.subjectCode || "").match(/^([A-Za-z]+)/);
      const leadingCount = leadingMatch ? leadingMatch[1].length : 0;
      setSubjectCodeWarning(leadingCount > 4);
    }
  }, [visible, initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Reset allowProceedWarnings when subjectCode changes
    if (name === "subjectCode") {
      setAllowProceedWarnings(false);
    }

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

      // Determine leading letters count from start of string (allow more than 4)
      const leadingMatch = upper.match(/^([A-Za-z]+)/);
      const leadingCount = leadingMatch ? leadingMatch[1].length : 0;
      // Show non-blocking yellow warning icon only when leading letters are MORE than 4
      setSubjectCodeWarning(leadingCount > 4);

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
      setFormData((prev) => ({ ...prev, schoolYearStart: "", schoolYearEnd: "" }));
    } else {
      const startNum = Math.max(2020, Math.min(2035, Number(val)));
      const endNum = Math.min(2035, startNum + 1);
      setFormData((prev) => ({
        ...prev,
        schoolYearStart: String(startNum),
        schoolYearEnd: String(endNum),
      }));
    }
    setStartOpen(false);
  };

  const handleSchoolYearEndChange = (val) => {
    if (!val) {
      setFormData((prev) => ({ ...prev, schoolYearStart: "", schoolYearEnd: "" }));
    } else {
      const endNum = Math.max(2020, Math.min(2035, Number(val)));
      const startNum = Math.max(2020, endNum - 1);
      setFormData((prev) => ({
        ...prev,
        schoolYearStart: String(startNum),
        schoolYearEnd: String(endNum),
      }));
    }
    setEndOpen(false);
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

    // Determine leading letters count
    const leadingMatch = (subjectCode || "").match(/^([A-Za-z]+)/);
    const leadingLetters = leadingMatch ? leadingMatch[1] : "";
    const leadingLettersCount = leadingLetters.length;

    // Blocking validation: must be letters (>=4) immediately followed by exactly 4 digits, and nothing else
    const strictPattern = /^[A-Za-z]{4,}\d{4}$/;
    if (!strictPattern.test(subjectCode)) {
      setErrorMessage("Subject Code invalid format.");
      return;
    }

    // If leading letters < 4 (should be caught by pattern but keep explicit guard)
    if (leadingLettersCount < 4) {
      setErrorMessage("Subject Code invalid format.");
      return;
    }

    // Evaluate non-blocking warnings:
    const codeChanged = Boolean(initialData && initialData.subjectCode && initialData.subjectCode !== subjectCode);
    // Non-blocking warning condition: leading letters more than 4 OR code changed
    const hasWarning = leadingLettersCount > 4 || codeChanged;

    // SCHOOL YEAR & TIME validation (unchanged)
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

    // DUPLICATE CHECK — blocks duplicate subjectCode when creating or changing code
    try {
      const targetRef = doc(db, "subjectList", subjectCode);
      const targetSnap = await getDoc(targetRef);

      if (!initialData && targetSnap.exists()) {
        setErrorMessage("A subject with that code already exists. Please pick a different code or edit the existing subject.");
        return;
      }

      if (initialData && codeChanged && targetSnap.exists()) {
        setErrorMessage("A subject with that code already exists. Please pick a different code or edit the existing subject.");
        return;
      }
    } catch (err) {
      console.warn("Duplicate check failed:", err);
      // non-blocking on network error
    }

    // Pass warning flag to parent. Parent should show ConfirmModal if hasWarning is true.
    if (typeof onSubmit === "function") {
      onSubmit(formData, hasWarning);
    }
    
    // Reset states on successful submit
    if (!hasWarning) {
      setAllowProceedWarnings(false);
      setStartOpen(false);
      setEndOpen(false);
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

          {/* Subject Code input with warning icons */}
          <div className="relative flex items-center">
            <input
              type="text"
              name="subjectCode"
              placeholder="Subject Code (letters then 4 digits)"
              value={formData.subjectCode}
              onChange={handleChange}
              className="w-full border rounded-md p-2 pr-10"
            />
            <div className="absolute right-2 top-2">
              {renderSubjectCodeIcon()}
            </div>
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

          <div className="flex gap-2 items-center">
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
            <div className="ml-2">
              {renderTimeIcon()}
            </div>
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

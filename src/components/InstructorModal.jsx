import React, { useState, useEffect } from "react";

const InstructorModal = ({ visible, onClose, onSubmit, initialData }) => {
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [program, setProgram] = useState("");
  const [course, setCourse] = useState("");
  const [scheduleSort, setScheduleSort] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [errors, setErrors] = useState({});

  const [programOptions, setProgramOptions] = useState([
    "Computer Science",
    "Information Technology",
    "Business Management",
  ]);

  const [courseOptions, setCourseOptions] = useState({
    "Computer Science": ["Data Structures", "Algorithms", "Operating Systems"],
    "Information Technology": [
      "Web Development",
      "Networking",
      "Database Systems",
    ],
    "Business Management": ["Accounting", "Marketing", "Finance"],
  });

  const nameOptions = [
    "Ante Pasing",
    "Ankol Bobot",
    "Kara David",
  ];

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setStartTime(initialData.startTime || "");
      setEndTime(initialData.endTime || "");
      setProgram(initialData.program || "");
      setCourse(initialData.course || "");
      setScheduleSort(initialData.scheduleSort || "");
      setYearLevel(initialData.yearLevel || "");
    } else {
      resetForm();
    }
  }, [initialData, visible]);

  const resetForm = () => {
    setName("");
    setStartTime("");
    setEndTime("");
    setProgram("");
    setCourse("");
    setScheduleSort("");
    setYearLevel("");
    setErrors({});
  };

  const validate = () => {
    const newErrors = {};
    if (!name.trim()) newErrors.name = "Name is required.";
    if (!startTime) newErrors.startTime = "Start time is required.";
    if (!endTime) newErrors.endTime = "End time is required.";
    if (!program.trim()) newErrors.program = "Program is required.";
    if (!course.trim()) newErrors.course = "Course is required.";
    if (!scheduleSort) newErrors.scheduleSort = "Schedule is required.";
    if (!yearLevel) newErrors.yearLevel = "Year level is required.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const instructorData = {
      name,
      startTime,
      endTime,
      program,
      course,
      scheduleSort,
      yearLevel,
    };
    onSubmit(instructorData);
    resetForm();
    onClose();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-6 rounded-md shadow-md w-96">
        <h2 className="text-xl font-semibold mb-4">
          {initialData ? "Edit Instructor" : "Assign Instructor"}
        </h2>

        {/* Name Dropdown */}
        <select
          className={`w-full border p-2 rounded mb-2 ${
            errors.name ? "border-red-500 border-2" : ""
          }`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        >
          <option value="">Assign Instructor</option>
          {nameOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {errors.name && <p className="text-red-500 text-sm mb-2">{errors.name}</p>}

        <div className="flex gap-4 mb-2">
          <div className="w-1/2">
            <label className="block text-sm font-medium mb-1">Start Time</label>
            <input
              type="time"
              className={`w-full border p-2 rounded ${
                errors.startTime ? "border-red-500 border-2" : ""
              }`}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="w-1/2">
            <label className="block text-sm font-medium mb-1">End Time</label>
            <input
              type="time"
              className={`w-full border p-2 rounded ${
                errors.endTime ? "border-red-500 border-2" : ""
              }`}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        {(errors.startTime || errors.endTime) && (
          <p className="text-red-500 text-sm mb-2">
            {errors.startTime || errors.endTime}
          </p>
        )}

        {/* Schedule & Year Level */}
        <div className="flex gap-4 mb-2">
          <div className="w-1/2">
            <label className="block text-sm font-medium mb-1">Schedule</label>
            <select
              className={`w-full border p-2 rounded ${
                errors.scheduleSort ? "border-red-500 border-2" : ""
              }`}
              value={scheduleSort}
              onChange={(e) => setScheduleSort(e.target.value)}
            >
              <option value="">Select</option>
              <option value="MWF">MWF</option>
              <option value="TTH">TTH</option>
            </select>
          </div>
          <div className="w-1/2">
            <label className="block text-sm font-medium mb-1">Year Level</label>
            <select
              className={`w-full border p-2 rounded ${
                errors.yearLevel ? "border-red-500 border-2" : ""
              }`}
              value={yearLevel}
              onChange={(e) => setYearLevel(e.target.value)}
            >
              <option value="">Select</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
              <option value="3rd Year">3rd Year</option>
              <option value="4th Year">4th Year</option>
            </select>
          </div>
        </div>

        {/* Program Dropdown */}
        <label className="block text-sm font-medium mb-1">Program</label>
        <select
          className={`w-full border p-2 rounded mb-2 ${
            errors.program ? "border-red-500 border-2" : ""
          }`}
          value={program}
          onChange={(e) => {
            setProgram(e.target.value);
            setCourse("");
          }}
        >
          <option value="">Select Program</option>
          {programOptions.map((prog) => (
            <option key={prog} value={prog}>
              {prog}
            </option>
          ))}
        </select>
        {errors.program && <p className="text-red-500 text-sm mb-2">{errors.program}</p>}

        {/* Course Dropdown */}
        <label className="block text-sm font-medium mb-1">Course</label>
        <select
          className={`w-full border p-2 rounded mb-4 ${
            errors.course ? "border-red-500 border-2" : ""
          }`}
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          disabled={!program}
        >
          <option value="">Select Course</option>
          {program &&
            courseOptions[program]?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
        {errors.course && <p className="text-red-500 text-sm mb-2">{errors.course}</p>}

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button
            className="bg-gray-500 text-white px-4 py-2 rounded"
            onClick={() => {
              onClose();
              resetForm();
            }}
          >
            Cancel
          </button>
          <button
            className="bg-blue-700 text-white font-medium px-6 py-2 rounded-md hover:bg-blue-800"
            onClick={handleSave}
          >
            {initialData ? "Update" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstructorModal;

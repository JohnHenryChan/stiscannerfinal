import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { collection, doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig.js";

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

  const docSub = collection(db, "subjectList");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (visible) {
      setFormData(
        initialData || {
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
        }
      );
      setErrorMessage("");
    }
  }, [visible, initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "schoolYearStart") {
      const numeric = value.replace(/\D/g, "").slice(0, 4);
      setFormData((prev) => ({
        ...prev,
        schoolYearStart: numeric,
        schoolYearEnd: numeric ? String(Number(numeric) + 1) : "",
      }));
    } else if (name === "schoolYearEnd") {
      const numeric = value.replace(/\D/g, "").slice(0, 4);
      setFormData((prev) => ({ ...prev, schoolYearEnd: numeric }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    setErrorMessage("");
  };

  const handleDayToggle = (day) => {
    setFormData((prev) => {
      const updatedDays = prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day];
      return { ...prev, days: updatedDays };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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

    if (
      !program ||
      !subject ||
      !subjectCode ||
      !yearLevel ||
      !startTime ||
      !endTime ||
      days.length === 0 ||
      !schoolYearStart ||
      !schoolYearEnd ||
      !semester
    ) {
      setErrorMessage("Please fill in all fields and select at least one day.");
      return;
    }

    if (!initialData) {
      const docRef = doc(docSub, subjectCode);
      const docCheck = await getDoc(docRef);

      if (docCheck.exists()) {
        setErrorMessage("Subject already exists.");
        return;
      }
    }

    onSubmit(formData);
    onClose();
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
          />
          <input
            type="text"
            name="subject"
            placeholder="Subject"
            value={formData.subject}
            onChange={handleChange}
            className="w-full border rounded-md p-2"
          />
          <input
            type="text"
            name="subjectCode"
            placeholder="Subject Code"
            value={formData.subjectCode}
            onChange={handleChange}
            className="w-full border rounded-md p-2"
          />
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
            <input
              type="text"
              name="schoolYearStart"
              placeholder="Start Year"
              value={formData.schoolYearStart}
              onChange={handleChange}
              className="w-full border rounded-md p-2"
            />
            <input
              type="text"
              name="schoolYearEnd"
              placeholder="End Year"
              value={formData.schoolYearEnd}
              onChange={handleChange}
              className="w-full border rounded-md p-2"
            />
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

          <input
            type="time"
            name="startTime"
            value={formData.startTime}
            onChange={handleChange}
            className="w-full border rounded-md p-2"
          />
          <input
            type="time"
            name="endTime"
            value={formData.endTime}
            onChange={handleChange}
            className="w-full border rounded-md p-2"
          />

          <div>
            <p className="font-medium mt-3">Tap to Toggle Days:</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {daysOfWeek.map((day) => (
                <button
                  type="button"
                  key={day}
                  onClick={() => handleDayToggle(day)}
                  className={`px-3 py-1 rounded-md border transition-colors duration-150 ${
                    formData.days.includes(day)
                      ? "bg-blue-700 text-white border-blue-800 hover:bg-blue-800"
                      : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

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

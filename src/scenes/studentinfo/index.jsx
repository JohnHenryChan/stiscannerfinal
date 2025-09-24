import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const StudentInformation = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedDate, setSelectedDate] = useState("");

  const attendanceData = [
    { date: "2024-11-20", status: "Present" },
    { date: "2024-11-19", status: "Present" },
    { date: "2024-11-18", status: "Absent" },
    { date: "2024-11-17", status: "Absent" },
    { date: "2024-11-16", status: "Absent" },
  ];

  const filteredData = selectedDate
    ? attendanceData.filter((entry) => entry.date === selectedDate)
    : attendanceData;

  const sortedData = [...filteredData].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar */}
      <div className="flex justify-between items-center p-4 shadow bg-blue sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="text-white text-3xl font-bold hover:underline transition"
          aria-label="Go back"
        >
          ←
        </button>
        <button className="text-sm text-white opacity-0 cursor-default">
          &nbsp;
        </button>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <h1 className="text-3xl font-bold text-black mb-6">
          Student Information
        </h1>

        <div className="bg-gray-100 p-6 rounded-lg shadow flex justify-between items-start mb-8">
          <div>
            <p className="text-lg text-gray-800 mb-2">
              <strong>Student ID:</strong> {studentId}
            </p>
            <p className="text-lg text-gray-800 mb-2">
              <strong>Name:</strong> Juan Dela Cruz
            </p>
            <p className="text-lg text-gray-800 mb-2">
              <strong>Contact Number:</strong> 09123456789
            </p>
            <p className="text-lg text-gray-800 mb-2">
              <strong>Parent/Guardian Name:</strong> Jane Doe
            </p>
            <p className="text-lg text-gray-800">
              <strong>Parent/Guardian Contact Number:</strong> 09876543210
            </p>
          </div>
          <div>
            <button
              onClick={() => navigate("/scan")}
              className="bg-blue-700 text-white font-medium px-6 py-2 rounded-md hover:bg-blue-800"
            >
              Scan
            </button>
          </div>
        </div>

        {/* Date Picker */}
        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="datePicker" className="text-lg font-medium">
            Date:
          </label>
          <input
            type="date"
            id="datePicker"
            className="border border-gray-300 rounded px-3 py-2 text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        {/* Attendance Table */}
        <div className="overflow-x-auto">
          <table className="w-full border border-black">
            <thead>
              <tr className="bg-gray-200 text-left">
                <th className="border border-black px-4 py-2 text-center">
                  Date
                </th>
                <th className="border border-black px-4 py-2 text-center">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.length > 0 ? (
                sortedData.map((entry, index) => (
                  <tr key={index}>
                    <td className="border border-black px-4 py-2 text-center">
                      {entry.date}
                    </td>
                    <td
                      className={`border border-black px-4 py-2 text-center ${
                        entry.status === "Absent" ? "text-red-600" : ""
                      }`}
                    >
                      {entry.status}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="2"
                    className="border border-black px-4 py-2 text-center text-gray-500"
                  >
                    No records found for selected date.
                  </td>
                </tr>
              )}
              {[...Array(5 - sortedData.length)].map((_, i) => (
                <tr key={`empty-${i}`}>
                  <td className="border border-black px-4 py-2">&nbsp;</td>
                  <td className="border border-black px-4 py-2">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StudentInformation;

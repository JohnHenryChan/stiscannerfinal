import React, { useState } from "react";
import SidebarAdmin from "../global/SidebarAdmin";
import TopbarAdmin from "../global/TopbarAdmin";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { FaUsers } from "react-icons/fa";

const Dashboard = () => {
  const [selectedProgram, setSelectedProgram] = useState("All");

  const programs = ["All", "BSCS", "IT", "HRS"];
  const students = [
    { name: "Juan D. Cruz", timeIn: "8:00 AM", timeOut: "1:00 PM" },
    { name: "Andrhea Mae Bayabos", timeIn: "2:00 PM", timeOut: "4:00 PM" },
    { name: "Mark L. Malupiton", timeIn: "9:08 AM", timeOut: "3:30 PM" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />
        <main className="flex-1 bg-gray-100 p-4 md:p-6">
          <h1 className="text-xl font-bold mb-4">Dashboard</h1>

          <div className="flex flex-col md:flex-row gap-4">
            {/* Left Side: Cards and Today Activity */}
            <div className="flex-1 space-y-4">
              {/* Cards */}
              <div className="flex gap-4">
                {/* Total Students */}
                <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center w-1/2">
                  <div className="bg-purple-100 rounded-full w-10 h-10 flex items-center justify-center mb-2">
                    <FaUsers className="text-purple-600 text-xl" />
                  </div>
                  <p className="text-sm text-gray-500">Total Students</p>
                  <h2 className="text-2xl font-bold">2468</h2>
                </div>

                {/* Student Status */}
                <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center w-1/2">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Students</p>
                  <select
                    className="text-sm border rounded px-2 py-1 mb-2"
                    value={selectedProgram}
                    onChange={(e) => setSelectedProgram(e.target.value)}
                  >
                    {programs.map((program) => (
                      <option key={program} value={program}>
                        {program}
                      </option>
                    ))}
                  </select>
                  <div className="w-20 h-20 rounded-full border-4 border-orange-400 border-r-purple-600 flex items-center justify-center mb-2">
                    <span className="text-lg font-bold">375</span>
                  </div>
                  <div className="flex justify-between text-xs gap-4">
                    <div className="flex items-center gap-1 text-green-600">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span> Present: 205
                    </div>
                    <div className="flex items-center gap-1 text-red-600">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span> Absent: 170
                    </div>
                  </div>
                </div>
              </div>

              {/* Today Activity */}
              <div className="bg-white rounded-lg shadow-md p-4">
                <h3 className="text-md font-semibold mb-3">Today Activity</h3>
                <ul className="space-y-2 text-sm">
                  {students.map((student, idx) => (
                    <li key={idx} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                        <span className="font-medium">{student.name}</span>
                      </div>
                      <div className="pl-5 text-xs text-gray-500">
                        Time In: {student.timeIn} | Time Out: {student.timeOut}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Calendar */}
            <div className="bg-white rounded-lg shadow-md p-4 w-full md:w-[420px]">
              <p className="text-sm font-semibold text-gray-700 mb-3">Calendar</p>
              <div className="flex justify-center scale-95">
                <Calendar />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
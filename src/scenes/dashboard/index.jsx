import React, { useState } from "react";
import SidebarAdmin from "../global/SidebarAdmin";
import TopbarAdmin from "../global/TopbarAdmin";
import { FaUsers, FaChalkboardTeacher } from "react-icons/fa";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";

const Dashboard = () => {
  // ===== State Variables =====
  const [selectedYear, setSelectedYear] = useState("2025");
  const [selectedMonth, setSelectedMonth] = useState("All");

  // ===== Example Students Table Data =====
  const students = [
    {
      name: "Kim Dela Cruz",
      status: "Present",
      timeIn: "11:30 AM",
      timeOut: "1:00 PM",
    },
    { name: "Juan Santos", status: "Absent", timeIn: "-", timeOut: "-" },
    {
      name: "Jessa Reyes",
      status: "Present",
      timeIn: "9:00 AM",
      timeOut: "3:00 PM",
    },
  ];

  // ===== Example Attendance Data by Year =====
  const attendanceDataByYear = {
    2025: [
      { month: "Jan", Late: 15, Absent: 22, NoLogs: 8 },
      { month: "Feb", Late: 12, Absent: 18, NoLogs: 10 },
      { month: "Mar", Late: 20, Absent: 25, NoLogs: 12 },
      { month: "Apr", Late: 14, Absent: 19, NoLogs: 9 },
      { month: "May", Late: 10, Absent: 15, NoLogs: 6 },
      { month: "June", Late: 10, Absent: 15, NoLogs: 6 },
    ],
    2024: [
      { month: "Jan", Late: 18, Absent: 20, NoLogs: 5 },
      { month: "Feb", Late: 14, Absent: 22, NoLogs: 9 },
      { month: "Mar", Late: 19, Absent: 28, NoLogs: 11 },
      { month: "Apr", Late: 10, Absent: 16, NoLogs: 8 },
      { month: "May", Late: 8, Absent: 12, NoLogs: 4 },
    ],
    2023: [
      { month: "Jan", Late: 10, Absent: 12, NoLogs: 3 },
      { month: "Feb", Late: 9, Absent: 10, NoLogs: 2 },
      { month: "Mar", Late: 13, Absent: 15, NoLogs: 6 },
      { month: "Apr", Late: 7, Absent: 11, NoLogs: 4 },
      { month: "May", Late: 5, Absent: 8, NoLogs: 3 },
    ],
  };

  const years = ["2025", "2024", "2023"];
  const months = ["All", "Jan", "Feb", "Mar", "Apr", "May", "June"];

  // ===== FUNCTION: Get filtered data based on selected year & month =====
  const getFilteredAttendanceData = () => {
    let data = attendanceDataByYear[selectedYear] || [];
    if (selectedMonth !== "All") {
      // Keep all months but highlight the selected month in the chart or tooltip
      data = data.map((d) => ({
        ...d,
        highlighted: d.month === selectedMonth,
      }));
    }
    return data;
  };

  // ====== Derived Data ======
  const filteredData = getFilteredAttendanceData();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />

        <main className="flex-1 p-6">
          <h1 className="text-2xl font-bold mb-6 text-gray-800">Dashboard</h1>

          {/* === TOP CARDS === */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            {/* Total Students */}
            <div className="bg-white shadow-md rounded-2xl p-5 flex flex-col items-center justify-center h-36 hover:shadow-lg transition-all duration-200">
              <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mb-3">
                <FaUsers className="text-blue-600 text-2xl" />
              </div>
              <p className="text-lg font-semibold text-gray-800">
                Total Students
              </p>
              <h2 className="text-3xl font-bold text-gray-800">2,468</h2>
            </div>

            {/* Total Teachers */}
            <div className="bg-white shadow-md rounded-2xl p-5 flex flex-col items-center justify-center h-36 hover:shadow-lg transition-all duration-200">
              <div className="bg-green-100 rounded-full w-12 h-12 flex items-center justify-center mb-3">
                <FaChalkboardTeacher className="text-green-600 text-2xl" />
              </div>
              <p className="text-lg font-semibold text-gray-800">
                Total Teachers
              </p>
              <h2 className="text-3xl font-bold text-gray-800">58</h2>
            </div>

            {/* Boys & Girls */}
            <div className="bg-white shadow-md rounded-2xl p-5 flex flex-col justify-center h-36 hover:shadow-lg transition-all duration-200">
              <h3 className="text-center font-semibold mb-3 text-gray-800">
                Student Breakdown
              </h3>
              <div className="flex justify-around">
                <div className="text-center">
                  <p className="text-blue-600 text-xl font-bold">1,200</p>
                  <p className="text-gray-500 text-sm">Boys</p>
                </div>
                <div className="text-center">
                  <p className="text-pink-500 text-xl font-bold">1,268</p>
                  <p className="text-gray-500 text-sm">Girls</p>
                </div>
              </div>
            </div>
          </div>

          {/* === GRAPH & TODAY'S ACTIVITY === */}
          <div className="grid grid-cols-1 lg:grid-cols-[2.1fr_1fr] gap-6 mb-6">
            {/* Attendance Issues Graph */}
            <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition-all duration-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Attendance Issues Overview
                </h3>
                <div className="flex gap-2">
                  <select
                    className="border rounded-lg px-3 py-1 text-sm text-gray-700"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>

                  <select
                    className="border rounded-lg px-3 py-1 text-sm text-gray-700"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  >
                    {months.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Chart */}
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={filteredData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Late"
                    stroke="#facc15"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    activeDot={{ r: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Absent"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    activeDot={{ r: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="NoLogs"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Today's Activity */}
            <div className="bg-white shadow-md rounded-2xl p-6 flex flex-col hover:shadow-lg transition-all duration-200">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">
                Today's Activity
              </h3>
              <ul className="space-y-3 text-gray-700 text-sm flex-grow">
                <li className="border-l-4 border-green-500 pl-3">
                  Kim Dela Cruz - Checked in at 11:30 AM
                </li>
                <li className="border-l-4 border-red-500 pl-3">
                  Juan Santos - Absent today
                </li>
                <li className="border-l-4 border-indigo-500 pl-3">
                  Jessa Reyes - Checked out at 3:00 PM
                </li>
              </ul>
            </div>
          </div>

          {/* === ATTENDANCE OVERVIEW === */}
          <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition-all duration-200">
            <h3 className="text-lg font-semibold mb-6 text-gray-800">
              Attendance Overview
            </h3>

            {/* Totals Section */}
            <div className="grid grid-cols-2 md:grid-cols-5 text-center mb-6">
              <div>
                <p className="text-2xl font-bold text-green-600">205</p>
                <p className="text-gray-500 font-medium">Present</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">170</p>
                <p className="text-gray-500 font-medium">Absent</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-500">28</p>
                <p className="text-gray-500 font-medium">Late</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-700">403</p>
                <p className="text-gray-500 font-medium">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">12</p>
                <p className="text-gray-500 font-medium">No Logs</p>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left border-t">
                <thead className="bg-gray-100 text-gray-600 uppercase">
                  <tr>
                    <th className="py-2 px-4">Student Name</th>
                    <th className="py-2 px-4">Status</th>
                    <th className="py-2 px-4">Time In</th>
                    <th className="py-2 px-4">Time Out</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-4">{s.name}</td>
                      <td
                        className={`py-2 px-4 font-medium ${
                          s.status === "Present"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {s.status}
                      </td>
                      <td className="py-2 px-4">{s.timeIn}</td>
                      <td className="py-2 px-4">{s.timeOut}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
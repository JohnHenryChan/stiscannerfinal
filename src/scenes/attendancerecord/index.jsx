import React, { useEffect, useState } from "react";
import SidebarAdmin from "../global/SidebarAdmin";
import TopbarAdmin from "../global/TopbarAdmin";
import { MdSearch } from "react-icons/md";
import { db } from "../../firebaseConfig";
import { collection, getDocs, doc } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const AttendanceRecord = () => {
  const getToday = () => new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(getToday());
  const [endDate, setEndDate] = useState(getToday());
  const [searchTerm, setSearchTerm] = useState("");
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [subjectList, setSubjectList] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [selectedRemarks, setSelectedRemarks] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);
  const [yearLevels, setYearLevels] = useState([]);
  const [page, setPage] = useState(1);
  const rowsPerPage = 30;

  // Toggle Flat vs Grouped view
  const [groupedView, setGroupedView] = useState(false);

  // Sorting state
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  // Fetch subjects
  useEffect(() => {
    const fetchSubjects = async () => {
      const snap = await getDocs(collection(db, "subjectList"));
      const subjects = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSubjectList(subjects);
      setYearLevels(["1st Year", "2nd Year", "3rd Year", "4th Year"]);
    };
    fetchSubjects();
  }, []);

  // Fetch attendance
  useEffect(() => {
    const fetchAttendance = async () => {
      if (!startDate || !endDate || subjectList.length === 0) {
        setAttendanceRows([]);
        return;
      }
      const allRecords = [];
      const dateRange = [];
      let current = new Date(startDate);
      const end = new Date(endDate);

      while (current <= end) {
        dateRange.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }

      await Promise.all(
        dateRange.map(async (dateStr) => {
          for (const subj of subjectList) {
            const subjectId = subj.id;
            const studentSnap = await getDocs(
              collection(doc(db, "attendance", dateStr), subjectId)
            );
            for (const snap of studentSnap.docs) {
              const data = snap.data();
              const studentId = data.studentId;
              let studentName = data.name || "";
              const subjectName = subj.subject || data.subject || "Unknown";
              const yearLevel = subj.yearLevel || "N/A";
              let timeIn = "—";

              if (data.timestamp?.toDate) {
                timeIn = data.timestamp.toDate().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              }

              allRecords.push({
                ...data,
                studentId,
                studentName: studentName || "Unknown",
                yearLevel,
                date: dateStr,
                subject: subjectName,
                subjectId,
                timeIn,
                remark: data.remark || "Absent",
              });
            }
          }
        })
      );

      setAttendanceRows(allRecords);
    };
    fetchAttendance();
  }, [startDate, endDate, subjectList]);

  // Filters
  const toggleSelect = (list, setList, value) => {
    setList((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const filteredRows = attendanceRows.filter((row) => {
    const searchMatch = `${row.studentId} ${row.studentName} ${row.subject}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const subjectMatch =
      selectedSubjects.length > 0 ? selectedSubjects.includes(row.subject) : true;
    const remarkMatch =
      selectedRemarks.length > 0 ? selectedRemarks.includes(row.remark) : true;
    const yearMatch =
      selectedYears.length > 0 ? selectedYears.includes(row.yearLevel) : true;
    return searchMatch && subjectMatch && remarkMatch && yearMatch;
  });

  // Sorting logic
  const sortedRows = React.useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [filteredRows, sortConfig]);

  const requestSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key && prev.direction === "asc") {
        return { key, direction: "desc" };
      }
      if (prev.key === key && prev.direction === "desc") {
        return { key: null, direction: null }; // reset to unsorted
      }
      return { key, direction: "asc" };
    });
  };

  const totalPages = Math.ceil(sortedRows.length / rowsPerPage);
  const paginatedRows = sortedRows.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const getRemarkTextColor = (remark) => {
    switch (remark) {
      case "Present":
        return "text-green-600";
      case "Late":
        return "text-yellow-600";
      case "Absent":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedSubjects([]);
    setSelectedRemarks([]);
    setSelectedYears([]);
  };

  // Grouped rows
  const groupedRows = sortedRows.reduce((acc, row) => {
    if (!acc[row.subject]) acc[row.subject] = [];
    acc[row.subject].push(row);
    return acc;
  }, {});

  // Export CSV
  const exportCSV = () => {
    const headers = [
      "Date,Student ID,Student Name,Subject,Year Level,Time In,Remarks",
    ];
    const rows = sortedRows.map(
      (r) =>
        `${r.date},${r.studentId},${r.studentName},${r.subject},${r.yearLevel},${r.timeIn},${r.remark}`
    );
    const csv = headers.concat(rows).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendance.csv";
    a.click();
  };

  // Export PDF
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Attendance Records", 14, 16);

    autoTable(doc, {
      startY: 20,
      head: [["Date", "Student ID", "Name", "Subject", "Year", "Time In", "Remark"]],
      body: sortedRows.map((r) => [
        r.date,
        r.studentId,
        r.studentName,
        r.subject,
        r.yearLevel,
        r.timeIn,
        r.remark,
      ]),
    });

    doc.save("attendance.pdf");
  };

  // Export XML
  const exportXML = () => {
    const xmlContent = ["<attendance>"]
      .concat(
        sortedRows.map(
          (r) => `  <record>
    <date>${r.date}</date>
    <studentId>${r.studentId}</studentId>
    <studentName>${r.studentName}</studentName>
    <subject>${r.subject}</subject>
    <yearLevel>${r.yearLevel}</yearLevel>
    <timeIn>${r.timeIn}</timeIn>
    <remark>${r.remark}</remark>
  </record>`
        )
      )
      .concat(["</attendance>"])
      .join("\n");

    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendance.xml";
    a.click();
  };

  const subjectOptions = subjectList.map((s) => s.subject).filter(Boolean);

  const SortHeader = ({ label, columnKey }) => {
    let arrow = "";
    if (sortConfig.key === columnKey) {
      arrow = sortConfig.direction === "asc" ? " ↑" : sortConfig.direction === "desc" ? " ↓" : "";
    }
    return (
      <th
        className="border px-4 py-2 cursor-pointer select-none"
        onClick={() => requestSort(columnKey)}
      >
        {label}{arrow}
      </th>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />
        <div className="flex-1 p-6">
          <h1 className="text-3xl font-semibold mb-6">Attendance Record</h1>

          {/* Toggle Flat/Grouped */}
          <div className="flex items-center mb-4">
            <label className="mr-2 font-medium">Grouped View:</label>
            <input
              type="checkbox"
              checked={groupedView}
              onChange={(e) => setGroupedView(e.target.checked)}
            />
          </div>

          {/* Filters */}
          <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
            <div className="flex items-center border rounded-md px-3 py-2 bg-white shadow-md w-64">
              <MdSearch className="text-gray-500" />
              <input
                type="text"
                placeholder="Search"
                className="outline-none px-2 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Subject filter */}
            <div className="flex gap-2 flex-wrap">
              {subjectOptions.map((subj, i) => (
                <button
                  key={i}
                  onClick={() => toggleSelect(selectedSubjects, setSelectedSubjects, subj)}
                  className={`px-3 py-1 rounded border ${
                    selectedSubjects.includes(subj)
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {subj}
                </button>
              ))}
            </div>

            {/* Remark filter */}
            <div className="flex gap-2 flex-wrap">
              {["Present", "Late", "Absent"].map((remark) => (
                <button
                  key={remark}
                  onClick={() => toggleSelect(selectedRemarks, setSelectedRemarks, remark)}
                  className={`px-3 py-1 rounded border ${
                    selectedRemarks.includes(remark)
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {remark}
                </button>
              ))}
            </div>

            {/* Year level filter */}
            <div className="flex gap-2 flex-wrap">
              {yearLevels.map((year) => (
                <button
                  key={year}
                  onClick={() => toggleSelect(selectedYears, setSelectedYears, year)}
                  className={`px-3 py-1 rounded border ${
                    selectedYears.includes(year)
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>

            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 border border-blue-500 rounded px-3 py-1 hover:bg-blue-50"
            >
              Clear Filters
            </button>

            {/* Date pickers */}
            <div className="flex items-center bg-white border rounded-md px-3 py-2 shadow-md">
              <label className="text-gray-700 font-medium mr-2">Start:</label>
              <input
                type="date"
                className="outline-none text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-center bg-white border rounded-md px-3 py-2 shadow-md">
              <label className="text-gray-700 font-medium mr-2">End:</label>
              <input
                type="date"
                className="outline-none text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={exportCSV}
              className="px-3 py-1 bg-green-600 text-white rounded"
            >
              Export CSV
            </button>
            <button
              onClick={exportPDF}
              className="px-3 py-1 bg-red-600 text-white rounded"
            >
              Export PDF
            </button>
            <button
              onClick={exportXML}
              className="px-3 py-1 bg-purple-600 text-white rounded"
            >
              Export XML
            </button>
          </div>

          {/* Table */}
          {!groupedView ? (
            <div className="overflow-x-auto shadow rounded-lg bg-white">
              <table className="min-w-full border border-gray-300 text-left text-sm">
                <thead className="bg-gray-100 font-semibold">
                  <tr>
                    <SortHeader label="Date" columnKey="date" />
                    <SortHeader label="Student ID" columnKey="studentId" />
                    <SortHeader label="Student Name" columnKey="studentName" />
                    <SortHeader label="Subject" columnKey="subject" />
                    <SortHeader label="Year Level" columnKey="yearLevel" />
                    <SortHeader label="Time In" columnKey="timeIn" />
                    <SortHeader label="Remarks" columnKey="remark" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, index) => {
                    const remarkColor = getRemarkTextColor(row.remark);
                    return (
                      <tr key={index} className="border-t hover:bg-gray-50">
                        <td className="border px-4 py-2">{row.date}</td>
                        <td className="border px-4 py-2">{row.studentId}</td>
                        <td className="border px-4 py-2">{row.studentName}</td>
                        <td className="border px-4 py-2">{row.subject}</td>
                        <td className="border px-4 py-2">{row.yearLevel}</td>
                        <td className="border px-4 py-2">{row.timeIn}</td>
                        <td className={`border px-4 py-2 font-medium ${remarkColor}`}>
                          {row.remark}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.keys(groupedRows).map((subject) => (
                <div key={subject} className="overflow-x-auto shadow rounded-lg bg-white">
                  <h2 className="text-lg font-bold px-4 py-2 border-b bg-gray-50">
                    {subject}
                  </h2>
                  <table className="min-w-full border border-gray-300 text-left text-sm">
                    <thead className="bg-gray-100 font-semibold">
                      <tr>
                        <SortHeader label="Date" columnKey="date" />
                        <SortHeader label="Student ID" columnKey="studentId" />
                        <SortHeader label="Student Name" columnKey="studentName" />
                        <SortHeader label="Year Level" columnKey="yearLevel" />
                        <SortHeader label="Time In" columnKey="timeIn" />
                        <SortHeader label="Remarks" columnKey="remark" />
                      </tr>
                    </thead>
                    <tbody>
                      {groupedRows[subject].map((row, index) => {
                        const remarkColor = getRemarkTextColor(row.remark);
                        return (
                          <tr key={index} className="border-t hover:bg-gray-50">
                            <td className="border px-4 py-2">{row.date}</td>
                            <td className="border px-4 py-2">{row.studentId}</td>
                            <td className="border px-4 py-2">{row.studentName}</td>
                            <td className="border px-4 py-2">{row.yearLevel}</td>
                            <td className="border px-4 py-2">{row.timeIn}</td>
                            <td className={`border px-4 py-2 font-medium ${remarkColor}`}>
                              {row.remark}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!groupedView && (
            <div className="flex items-center justify-between p-3 border-t bg-gray-50">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className={`px-3 py-1 rounded ${
                  page === 1
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white"
                }`}
              >
                Previous
              </button>

              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>

              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className={`px-3 py-1 rounded ${
                  page === totalPages
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white"
                }`}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceRecord;

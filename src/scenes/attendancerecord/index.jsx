import React, { useEffect, useState, useRef } from "react";
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

  // subject dropdown state + ref for outside-click close
  const [openSubjectDropdown, setOpenSubjectDropdown] = useState(false);
  const subjDropdownRef = useRef(null);

  // remark & year dropdown state + refs (prevent ReferenceError)
  const [openRemarkDropdown, setOpenRemarkDropdown] = useState(false);
  const remarkDropdownRef = useRef(null);
  const [openYearDropdown, setOpenYearDropdown] = useState(false);
  const yearDropdownRef = useRef(null);

  // Fetch subjects
  useEffect(() => {
    const fetchSubjects = async () => {
      // read every document (subjectCode) under root/subjectList and use its 'subject' field
      const snap = await getDocs(collection(db, "subjectList"));
      const subjects = snap.docs.map((d) => {
        const data = d.data() || {};
        // ensure we always have a subject string (fallback to doc id)
        return {
          id: d.id,
          subject: String(data.subject || "").trim() || d.id,
          ...data,
        };
      });
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

  // options for the dropdown: ensure unique subject names from every subjectCode document
  const subjectOptions = Array.from(
    new Set(subjectList.map((s) => (s && s.subject ? s.subject : s.id)))
  )
    .filter(Boolean)
    .sort();

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

  // close dropdowns on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (subjDropdownRef?.current && !subjDropdownRef.current.contains(e.target)) {
        setOpenSubjectDropdown(false);
      }
      if (remarkDropdownRef?.current && !remarkDropdownRef.current.contains(e.target)) {
        setOpenRemarkDropdown(false);
      }
      if (yearDropdownRef?.current && !yearDropdownRef.current.contains(e.target)) {
        setOpenYearDropdown(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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

            {/* Subject checklist dropdown */}
            <div className="relative" ref={subjDropdownRef}>
              <button
                onClick={() => setOpenSubjectDropdown((s) => !s)}
                className="px-3 py-1 rounded border bg-white flex items-center gap-2"
              >
                Subjects
                {selectedSubjects.length > 0 ? (
                  <span className="text-xs text-gray-600">({selectedSubjects.length})</span>
                ) : null}
                <span className="ml-2 text-gray-500">{openSubjectDropdown ? "▾" : "▸"}</span>
              </button>
              {openSubjectDropdown && (
                <div className="absolute left-0 mt-2 w-60 max-h-48 overflow-auto bg-white border rounded shadow z-40 p-2">
                  {subjectOptions.length === 0 ? (
                    <div className="text-sm text-gray-500 p-2">No subjects</div>
                  ) : (
                    subjectOptions.map((subj, i) => (
                      <label key={i} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                        <input
                          type="checkbox"
                          checked={selectedSubjects.includes(subj)}
                          onChange={() => toggleSelect(selectedSubjects, setSelectedSubjects, subj)}
                        />
                        <span className="text-sm">{subj}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Remark checklist dropdown */}
            <div className="relative" ref={remarkDropdownRef}>
              <button
                onClick={() => setOpenRemarkDropdown((s) => !s)}
                className="px-3 py-1 rounded border bg-white flex items-center gap-2"
              >
                Remarks
                {selectedRemarks.length > 0 ? (
                  <span className="text-xs text-gray-600">({selectedRemarks.length})</span>
                ) : null}
                <span className="ml-2 text-gray-500">{openRemarkDropdown ? "▾" : "▸"}</span>
              </button>
              {openRemarkDropdown && (
                <div className="absolute left-0 mt-2 w-48 max-h-40 overflow-auto bg-white border rounded shadow z-40 p-2">
                  {["Late", "Absent", "Present"].map((remark) => (
                    <label key={remark} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={selectedRemarks.includes(remark)}
                        onChange={() => toggleSelect(selectedRemarks, setSelectedRemarks, remark)}
                      />
                      <span className="text-sm">{remark}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Year level checklist dropdown */}
            <div className="relative" ref={yearDropdownRef}>
              <button
                onClick={() => setOpenYearDropdown((s) => !s)}
                className="px-3 py-1 rounded border bg-white flex items-center gap-2"
              >
                Year Level
                {selectedYears.length > 0 ? (
                  <span className="text-xs text-gray-600">({selectedYears.length})</span>
                ) : null}
                <span className="ml-2 text-gray-500">{openYearDropdown ? "▾" : "▸"}</span>
              </button>
              {openYearDropdown && (
                <div className="absolute left-0 mt-2 w-40 max-h-40 overflow-auto bg-white border rounded shadow z-40 p-2">
                  {yearLevels.map((year) => (
                    <label key={year} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={selectedYears.includes(year)}
                        onChange={() => toggleSelect(selectedYears, setSelectedYears, year)}
                      />
                      <span className="text-sm">{year}</span>
                    </label>
                  ))}
                </div>
              )}
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

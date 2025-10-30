import React, { useEffect, useState, useRef } from "react";
import SidebarAdmin from "../global/SidebarAdmin";
import TopbarAdmin from "../global/TopbarAdmin";
import { MdSearch } from "react-icons/md";
import { db } from "../../firebaseConfig";
import { collection, getDocs, getDoc, doc, setDoc, query, where } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { utils as XLSXUtils, writeFile as XLSXWrite } from 'xlsx';
import { useAuth } from "../../context/AuthContext";

// dry-run: when true only logs planned writes (no writes to attendance/config)
const WRITE_ABSENCE_DRY_RUN = false;

// helper: format local YYYY-MM-DD
const formatDateLocal = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

// helper: inclusive date iterator
const iterateDatesInclusive = (startDate, endDate) => {
  const out = [];
  const cur = new Date(startDate);
  cur.setHours(0,0,0,0);
  const end = new Date(endDate);
  end.setHours(0,0,0,0);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

// helper: return start/end of current week (YYYY-MM-DD)
const getWeekDates = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  start.setHours(0,0,0,0);
  const end = new Date(now);
  end.setDate(now.getDate() + (6 - dayOfWeek));
  end.setHours(23,59,59,999);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
};

const AttendanceRecord = () => {
  const { user } = useAuth();
  console.log("[AttendanceRecord] Component mounted, user:", user);

  // State declarations
  const weekDates = getWeekDates();
  const [userRole, setUserRole] = useState("");
  const [startDate, setStartDate] = useState(weekDates.start);
  const [endDate, setEndDate] = useState(weekDates.end);
  const [searchTerm, setSearchTerm] = useState("");
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [subjectList, setSubjectList] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [selectedRemarks, setSelectedRemarks] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);
  const [yearLevels, setYearLevels] = useState([]);
  const [page, setPage] = useState(1);
  const [groupedView, setGroupedView] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [openSubjectDropdown, setOpenSubjectDropdown] = useState(false);
  const [openRemarkDropdown, setOpenRemarkDropdown] = useState(false);
  const [openYearDropdown, setOpenYearDropdown] = useState(false);
  const [ownedSubjectIds, setOwnedSubjectIds] = useState([]); // subject IDs/codes owned by the instructor

  // Refs
  const subjDropdownRef = useRef(null);
  const remarkDropdownRef = useRef(null);
  const yearDropdownRef = useRef(null);

  // Constants
  const rowsPerPage = 30;

  // Check if user can edit remarks
  const isRemarkEditable = (role) => {
    console.log("[isRemarkEditable] Checking role:", role);
    const canEdit = role === "admin" || role === "guidance";
    console.log("[isRemarkEditable] Can edit:", canEdit);
    return canEdit;
  };

  // Handle remark change
  const handleRemarkChange = async (row, newRemark) => {
    console.log("[handleRemarkChange] Updating remark:", { row, newRemark });
    try {
      const attRef = doc(db, "attendance", row.date, row.subjectId, row.studentId);
      await setDoc(attRef, { remark: newRemark }, { merge: true });
      console.log("[handleRemarkChange] Successfully updated remark in Firestore");
      
      // Update local state
      setAttendanceRows(prev => 
        prev.map(r => 
          r.date === row.date && r.subjectId === row.subjectId && r.studentId === row.studentId
            ? { ...r, remark: newRemark }
            : r
        )
      );
      console.log("[handleRemarkChange] Updated local state");
    } catch (error) {
      console.error("[handleRemarkChange] Error updating remark:", error);
    }
  };

  // Fetch user role
  useEffect(() => {
    console.log("[useEffect:userRole] Checking user role...");
    if (user?.role) {
      console.log("[useEffect:userRole] User role found:", user.role);
      setUserRole(user.role);
    } else {
      console.log("[useEffect:userRole] No role found in user object");
    }
  }, [user]);

  // Fetch subjects
  useEffect(() => {
    const fetchSubjects = async () => {
      console.log("[fetchSubjects] Starting fetch...");
      const snap = await getDocs(collection(db, "subjectList"));
      const subjects = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          subject: String(data.subject || "").trim() || d.id,
          ...data,
        };
      });
      console.log("[fetchSubjects] Fetched subjects:", subjects.length);
      setSubjectList(subjects);
      setYearLevels(["1st Year", "2nd Year", "3rd Year", "4th Year"]);
    };
    fetchSubjects();
  }, []);

  // Load instructor-owned subject IDs from Firestore mapping:
  // instructors/{docId}.subjectList (docId may NOT be uid) -> if not found, query where("uid","==",user.uid)
  useEffect(() => {
    const fetchOwnedSubjectIds = async () => {
      try {
        if (userRole !== "instructor" || !user?.uid) {
          setOwnedSubjectIds([]);
          return;
        }

        // Try doc keyed by uid first
        let instrSnap = await getDoc(doc(db, "instructors", user.uid));

        // Fallback: query by uid (when doc id is employee number)
        if (!instrSnap.exists()) {
          const qs = await getDocs(query(collection(db, "instructors"), where("uid", "==", user.uid)));
          if (!qs.empty) instrSnap = qs.docs[0];
        }

        const list = Array.isArray(instrSnap?.data()?.subjectList) ? instrSnap.data().subjectList : [];
        setOwnedSubjectIds(list.map(String));
        console.log(`[OwnedSubjects] User: ${user?.uid}, Role: ${userRole}`);
        console.log(`[OwnedSubjects] Found instructor doc:`, instrSnap?.exists());
        console.log(`[OwnedSubjects] Raw subjectList:`, instrSnap?.data()?.subjectList);
        console.log(`[OwnedSubjects] Processed ownedSubjectIds:`, list);
      } catch (err) {
        console.error("[AttendanceRecord] fetchOwnedSubjectIds error:", err);
        setOwnedSubjectIds([]);
      }
    };

    fetchOwnedSubjectIds();
  }, [userRole, user?.uid]);

  // After subjects are loaded elsewhere, restrict the list for instructors using ownedSubjectIds
  useEffect(() => {
    if (userRole !== "instructor") return;
    
    setSubjectList((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      
      // If instructor has no owned subjects, show empty list
      if (!ownedSubjectIds || ownedSubjectIds.length === 0) {
        console.log("[SubjectFilter] Instructor has no owned subjects, showing empty list");
        return [];
      }
      
      // Filter to only owned subjects
      const filtered = prev.filter((s) => {
        const sid = String(s?.id || "");
        const scode = String(s?.subjectCode || sid);
        const isOwned = ownedSubjectIds.includes(sid) || ownedSubjectIds.includes(scode);
        console.log(`[SubjectFilter] Subject ${sid} (${s.subject}) owned: ${isOwned}`);
        return isOwned;
      });
      
      console.log(`[SubjectFilter] Filtered subjects: ${filtered.length} of ${prev.length}`);
      return filtered;
    });
  }, [userRole, ownedSubjectIds]);

  // Sort function
  const sortAttendanceByDateAndAbsence = (records) => {
    console.log("[sortAttendanceByDateAndAbsence] Sorting records:", records.length);
    return [...records].sort((a, b) => {
      if (a.remark === "Absent" && b.remark !== "Absent") return 1;
      if (a.remark !== "Absent" && b.remark === "Absent") return -1;
      
      const dateTimeA = new Date(`${a.date} ${a.timeIn || '00:00'}`).getTime();
      const dateTimeB = new Date(`${b.date} ${b.timeIn || '00:00'}`).getTime();
      return dateTimeB - dateTimeA;
    });
  };

  // Fetch attendance
  useEffect(() => {
    const fetchAttendance = async () => {
      console.log("[fetchAttendance] Starting fetch with dates:", { startDate, endDate });
      if (!startDate || !endDate || subjectList.length === 0) {
        console.log("[fetchAttendance] Missing required data, skipping");
        setAttendanceRows([]);
        return;
      }
      const allRecords = [];
      const dateRange = [];
      const current = new Date(startDate);
      const end = new Date(endDate);

      while (current <= end) {
        dateRange.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
      console.log("[fetchAttendance] Date range:", dateRange);

      await Promise.all(
        dateRange.map(async (dateStr) => {
          for (const subj of subjectList) {
            const subjectId = subj.id;

            // Instructors: only fetch subjects they own
            if (userRole === "instructor") {
              // If no owned subjects, skip everything
              if (!ownedSubjectIds || ownedSubjectIds.length === 0) {
                console.log("[AttendanceFilter] Instructor has no owned subjects, skipping all");
                continue;
              }
              
              const scode = String(subj?.subjectCode || subjectId);
              const isOwned = ownedSubjectIds.includes(subjectId) || ownedSubjectIds.includes(scode);
              if (!isOwned) {
                console.log(`[AttendanceFilter] Skipping non-owned subject: ${subjectId}`);
                continue;
              }
              console.log(`[AttendanceFilter] Processing owned subject: ${subjectId}`);
            }
            
            const studentSnap = await getDocs(collection(doc(db, "attendance", dateStr), subjectId));
            for (const snap of studentSnap.docs) {
              const data = snap.data();
              const studentId = data.studentId;
              const subjectName = subj.subject || data.subject || subjectId;
              const yearLevel = subj.yearLevel || data.year || "N/A";

              // FIX: stray "let ti" -> define properly
              let timeIn = "—";
              if (data.timestamp?.toDate) {
                timeIn = data.timestamp.toDate().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              }

              // FIX: stray "llRecords.p" -> correct push
              allRecords.push({
                ...data,
                studentId,
                studentName: data.name || "",
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

      console.log("[fetchAttendance] Fetched records:", allRecords.length);
      const sortedRecords = sortAttendanceByDateAndAbsence(allRecords);
      setAttendanceRows(sortedRecords);
    };
    fetchAttendance();
  }, [startDate, endDate, subjectList, userRole, ownedSubjectIds]);

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
        return { key: null, direction: null };
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
      case "Excused":
        return "text-blue-600";
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
    console.log("[exportPDF] Exporting PDF");
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
    console.log("[exportPDF] PDF exported successfully");
  };

  // Export to Excel
  const exportToExcel = () => {
    console.log("[exportToExcel] Exporting Excel");
    const rows = groupedView 
      ? Object.values(groupedRows).flat() 
      : filteredRows || attendanceRows || [];

    if (!rows?.length) {
      console.log("[exportToExcel] No rows to export");
      return;
    }

    const columns = [
      { key: "date", label: "Date", width: 12 },
      { key: "studentId", label: "Student ID", width: 15 },
      { key: "studentName", label: "Student Name", width: 30 },
      { key: "subject", label: "Subject", width: 40 },
      { key: "yearLevel", label: "Year Level", width: 12 },
      { key: "timeIn", label: "Time In", width: 12 },
      { key: "remark", label: "Remarks", width: 15 }
    ];

    const excelData = rows.map(row => ({
      "Date": row.date || '',
      "Student ID": row.studentId || '',
      "Student Name": row.studentName || '',
      "Subject": row.subject || '',
      "Year Level": row.yearLevel || '',
      "Time In": row.timeIn || '',
      "Remarks": row.remark || ''
    }));

    const wb = XLSXUtils.book_new();
    const ws = XLSXUtils.json_to_sheet(excelData);
    ws['!cols'] = columns.map(col => ({ wch: col.width }));
    XLSXUtils.book_append_sheet(wb, ws, "Attendance");

    const dateStr = startDate && endDate 
      ? `${startDate}_to_${endDate}` 
      : new Date().toISOString().slice(0,10);
    const filename = `attendance_${dateStr}.xlsx`;

    XLSXWrite(wb, filename);
    console.log("[exportToExcel] Excel exported successfully");
  };

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

  // on-mount check for writeAbsence
  useEffect(() => {
    const checkWriteAbsence = async () => {
      try {
        console.log("[writeAbsence] starting mount check...");

        const cfgRef = doc(db, "system", "attendance");
        let cfgSnap = null;
        try {
          cfgSnap = await getDoc(cfgRef);
        } catch (err) {
          console.warn("[writeAbsence] failed reading config doc:", err);
        }
        const rawVal = cfgSnap?.exists() ? cfgSnap.data()?.writeAbsence : null;
        console.log("[writeAbsence] config raw value:", rawVal);

        const parseStoredDate = (v) => {
          if (!v) return null;
          if (typeof v === "object" && typeof v.toDate === "function") return v.toDate();
          const parsed = new Date(String(v));
          return isNaN(parsed.getTime()) ? null : parsed;
        };

        const storedDate = parseStoredDate(rawVal);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        const todayStr = formatDateLocal(today);

        try {
          const sSnap = await getDocs(collection(db, "subjectList"));
          const subjects = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setSubjectList(subjects);
          console.log("[writeAbsence] loaded subjectList count:", subjects.length);
        } catch (err) {
          console.error("[writeAbsence] failed to fetch subjectList:", err);
        }

        try {
          const studSnap = await getDocs(collection(db, "students"));
          const students = studSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAllStudents(students);
          console.log("[writeAbsence] loaded students count:", students.length);
        } catch (err) {
          console.error("[writeAbsence] failed to fetch students:", err);
        }

        if (!storedDate) {
          console.log("[writeAbsence] no writeAbsence value or invalid -> will set to today:", todayStr);
          console.log("[writeAbsence] action:", WRITE_ABSENCE_DRY_RUN ? "DRY-RUN (no write performed)" : "UPDATING CONFIG");
          if (!WRITE_ABSENCE_DRY_RUN) {
            await setDoc(cfgRef, { writeAbsence: todayStr }, { merge: true });
            console.log("[writeAbsence] config updated to today:", todayStr);
          }
          return;
        }

        // Normalize stored date to start of day
        const normalizedStoredDate = new Date(storedDate);
        normalizedStoredDate.setHours(0, 0, 0, 0);
        const storedStr = formatDateLocal(normalizedStoredDate);
        
        console.log("[writeAbsence] parsed stored date:", storedStr, "today:", todayStr);

        if (storedStr === todayStr) {
          console.log("[writeAbsence] stored date equals today -> nothing to do");
          return;
        }

        if (normalizedStoredDate > today) {
          console.log("[writeAbsence] stored date is in the future -> resetting to today");
          console.log("[writeAbsence] action:", WRITE_ABSENCE_DRY_RUN ? "DRY-RUN (would update config)" : "UPDATING CONFIG");
          if (!WRITE_ABSENCE_DRY_RUN) {
            await setDoc(cfgRef, { writeAbsence: todayStr }, { merge: true });
            console.log("[writeAbsence] config updated to today:", todayStr);
          }
          return;
        }

        // 🔥 CHANGED: Include stored date, iterate up to YESTERDAY (not today)
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        
        console.log("[writeAbsence] stored date is before today -> processing range", storedStr, "to", formatDateLocal(yesterday));

        if (normalizedStoredDate > yesterday) {
          console.log("[writeAbsence] stored date is today or yesterday -> nothing to process");
          return;
        }

        // 🔥 ITERATE FROM storedDate (INCLUSIVE) TO yesterday (INCLUSIVE)
        const datesToProcess = iterateDatesInclusive(normalizedStoredDate, yesterday);
        console.log("[writeAbsence] dates to process:", datesToProcess.map(d => formatDateLocal(d)));

        const subjects = subjectList.length ? subjectList : (await getDocs(collection(db, "subjectList"))).docs.map(d=>({id:d.id,...d.data()}));
        const studentsCache = allStudents.length ? allStudents : (await getDocs(collection(db, "students"))).docs.map(d=>({id:d.id,...d.data()}));

        for (const dateObj of datesToProcess) {
          const dateStr = formatDateLocal(dateObj);
          const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
          console.log(`[writeAbsence] processing date ${dateStr} (weekday ${weekday})`);

          const subjectsForDate = subjects.filter(s => s.active !== false && Array.isArray(s.days) && s.days.includes(weekday));
          console.log(`[writeAbsence] subjects active on ${dateStr}:`, subjectsForDate.map(s => ({ id: s.id, subject: s.subject || s.name })));

          for (const subj of subjectsForDate) {
            const subjectId = subj.id;
            const subjectName = subj.subject || subj.name || subjectId;

            let enrolledIds = Array.isArray(subj.studentIds) ? subj.studentIds.slice() : [];
            if ((!enrolledIds || enrolledIds.length === 0)) {
              try {
                const studentsCol = collection(db, "subjectList", subjectId, "students");
                const sSnap = await getDocs(studentsCol);
                if (!sSnap.empty) enrolledIds = sSnap.docs.map(d => d.id);
              } catch (err) {
                console.warn("[writeAbsence] failed to fetch enrolled students subcollection for", subjectId, err);
              }
            }

            console.log(`[writeAbsence] subject ${subjectId} (${subjectName}) has ${enrolledIds.length} enrolled students`);

            for (const studentId of enrolledIds) {
              try {
                const attRef = doc(db, "attendance", dateStr, subjectId, studentId);
                const attSnap = await getDoc(attRef);
                if (attSnap.exists()) {
                  console.log(`[writeAbsence] attendance already exists - skipping: attendance/${dateStr}/${subjectId}/${studentId}`, attSnap.data());
                  continue;
                }

                const studentData = studentsCache.find(s => s.id === studentId) || {};
                const payload = {
                  subjectId,
                  subjectName,
                  studentId,
                  name: studentData.name || `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim() || null,
                  rfid: studentData.rfid || null,
                  year: studentData.year || studentData.yearLevel || null,
                  date: dateStr,
                  remark: "Absent"
                };

                console.log("[writeAbsence] WILL WRITE absent document (or log):", {
                  path: `attendance/${dateStr}/${subjectId}/${studentId}`,
                  payload,
                  dryRun: WRITE_ABSENCE_DRY_RUN
                });

                if (!WRITE_ABSENCE_DRY_RUN) {
                  await setDoc(attRef, payload);
                  console.log("[writeAbsence] wrote absent doc:", `attendance/${dateStr}/${subjectId}/${studentId}`);
                }
              } catch (err) {
                console.error("[writeAbsence] error checking/writing attendance for", { dateStr, subjectId, studentId }, err);
              }
            }
          }
        }

        console.log("[writeAbsence] processing complete. would update config to today:", todayStr, "action:", WRITE_ABSENCE_DRY_RUN ? "DRY-RUN (no update performed)" : "UPDATING CONFIG");
        if (!WRITE_ABSENCE_DRY_RUN) {
          await setDoc(cfgRef, { writeAbsence: todayStr }, { merge: true });
          console.log("[writeAbsence] config updated to today:", todayStr);
        }
      } catch (err) {
        console.error("[writeAbsence] unexpected error:", err);
      }
    };

    checkWriteAbsence();
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
                {selectedSubjects.length > 0 && (
                  <span className="text-xs text-gray-600">({selectedSubjects.length})</span>
                )}
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
                {selectedRemarks.length > 0 && (
                  <span className="text-xs text-gray-600">({selectedRemarks.length})</span>
                )}
                <span className="ml-2 text-gray-500">{openRemarkDropdown ? "▾" : "▸"}</span>
              </button>
              {openRemarkDropdown && (
                <div className="absolute left-0 mt-2 w-48 max-h-40 overflow-auto bg-white border rounded shadow z-40 p-2">
                  {["Late", "Absent", "Present", "Excused"].map((remark) => (
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
                {selectedYears.length > 0 && (
                  <span className="text-xs text-gray-600">({selectedYears.length})</span>
                )}
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
              onClick={exportToExcel}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md"
            >
              Export Excel
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
                  {paginatedRows.map((row, index) => (
                    <tr key={index} className="border-t hover:bg-gray-50">
                      <td className="border px-4 py-2">{row.date}</td>
                      <td className="border px-4 py-2">{row.studentId}</td>
                      <td className="border px-4 py-2">{row.studentName}</td>
                      <td className="border px-4 py-2">{row.subject}</td>
                      <td className="border px-4 py-2">{row.yearLevel}</td>
                      <td className="border px-4 py-2">{row.timeIn}</td>
                      <td className={`border px-4 py-2 font-medium ${getRemarkTextColor(row.remark)}`}>
                        {isRemarkEditable(userRole) ? (
                          <select
                            value={row.remark || "Absent"}
                            onChange={(e) => handleRemarkChange(row, e.target.value)}
                            className={`font-medium ${getRemarkTextColor(row.remark)} bg-transparent border-none cursor-pointer`}
                          >
                            <option value="Present">Present</option>
                            <option value="Late">Late</option>
                            <option value="Absent">Absent</option>
                            <option value="Excused">Excused</option>
                          </select>
                        ) : (
                          row.remark
                        )}
                      </td>
                    </tr>
                  ))}
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
                      {groupedRows[subject].map((row, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="border px-4 py-2">{row.date}</td>
                          <td className="border px-4 py-2">{row.studentId}</td>
                          <td className="border px-4 py-2">{row.studentName}</td>
                          <td className="border px-4 py-2">{row.yearLevel}</td>
                          <td className="border px-4 py-2">{row.timeIn}</td>
                          <td className={`border px-4 py-2 font-medium ${getRemarkTextColor(row.remark)}`}>
                            {isRemarkEditable(userRole) ? (
                              <select
                                value={row.remark || "Absent"}
                                onChange={(e) => handleRemarkChange(row, e.target.value)}
                                className={`font-medium ${getRemarkTextColor(row.remark)} bg-transparent border-none cursor-pointer`}
                              >
                                <option value="Present">Present</option>
                                <option value="Late">Late</option>
                                <option value="Absent">Absent</option>
                                <option value="Excused">Excused</option>
                              </select>
                            ) : (
                              row.remark
                            )}
                          </td>
                        </tr>
                      ))}
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

          {/* No subjects assigned info (instructor only) */}
          {userRole === "instructor" && (!ownedSubjectIds || ownedSubjectIds.length === 0) && (
            <div className="text-center py-8 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-700 font-medium">No subjects assigned to your account.</p>
              <p className="text-yellow-600 text-sm">Please contact the administrator/registrar to assign subjects to your profile.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceRecord;

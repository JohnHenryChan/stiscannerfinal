import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import TopbarAdmin from "../global/TopbarAdmin";
import SidebarAdmin from "../global/SidebarAdmin";

const StudentInformation = () => {
  const { studentId: paramStudentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [studentId, setStudentId] = useState(location.state?.studentId || paramStudentId);
  const [student, setStudent] = useState(null);
  const [loadingStudent, setLoadingStudent] = useState(true);
  const [error, setError] = useState(null);

  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(location.state?.selectedSubject || "All");

  // date range picker
  const [startDate, setStartDate] = useState(location.state?.startDate || "");
  const [endDate, setEndDate] = useState(location.state?.endDate || "");

  // attendanceEntries will contain records for this student (all dates/subjects) by default
  const [attendanceEntries, setAttendanceEntries] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  useEffect(() => {
    if (location.state?.studentId && location.state.studentId !== studentId) {
      setStudentId(location.state.studentId);
    }
  }, [location.state, studentId]);

  useEffect(() => {
    let cancelled = false;
    const fetchStudent = async () => {
      setLoadingStudent(true);
      setError(null);
      try {
        if (!studentId) {
          setStudent(null);
          setLoadingStudent(false);
          return;
        }
        const sRef = doc(db, "students", String(studentId));
        const sSnap = await getDoc(sRef);
        if (!cancelled) {
          setStudent(sSnap.exists() ? { id: sSnap.id, ...(sSnap.data() || {}) } : null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoadingStudent(false);
      }
    };
    fetchStudent();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    // load subject list for filter and name lookup
    let cancelled = false;
    const loadSubjects = async () => {
      try {
        const snap = await getDocs(collection(db, "subjectList"));
        if (cancelled) return;
        const arr = snap.docs.map((d) => ({
          id: d.id,
          name: d.data()?.name || d.data()?.subject || d.data()?.subjectName || d.id,
        }));
        setSubjects(arr);
      } catch (err) {
        console.warn("Failed to load subjects:", err);
      }
    };
    loadSubjects();
    return () => {
      cancelled = true;
    };
  }, []);

  // helper: compare date strings "YYYY-MM-DD"
  const inRange = (dateStr, start, end) => {
    if (!start && !end) return true;
    const d = new Date(dateStr + "T00:00:00");
    if (start && new Date(start + "T00:00:00") > d) return false;
    if (end && new Date(end + "T00:00:00") < d) return false;
    return true;
  };

  useEffect(() => {
    // fetch ALL attendance records for this student across dates & subjects (then filters applied client-side)
    let cancelled = false;
    const fetchAllRecordsForStudent = async () => {
      setLoadingAttendance(true);
      setAttendanceEntries([]);
      if (!studentId) {
        setLoadingAttendance(false);
        return;
      }

      try {
        // load list of dates under attendance top-level
        const datesSnap = await getDocs(collection(db, "attendance"));
        const dateIds = datesSnap.docs.map((d) => d.id);

        // determine subject ids to check (either selected or all known)
        const availableSubjects = subjects.length
          ? subjects
          : (await getDocs(collection(db, "subjectList"))).docs.map((d) => ({ id: d.id, name: d.data()?.name || d.id }));
        const subjectIdsToCheck = selectedSubject && selectedSubject !== "All"
          ? [selectedSubject]
          : availableSubjects.map((s) => s.id);

        const records = [];

        // For each date & subject, check the student doc at attendance/{date}/{subject}/{studentId}
        await Promise.all(
          dateIds.map(async (dateId) => {
            if (!inRange(dateId, startDate, endDate)) return;
            await Promise.all(
              subjectIdsToCheck.map(async (subId) => {
                try {
                  const attDocRef = doc(db, "attendance", String(dateId), String(subId), String(studentId));
                  const attSnap = await getDoc(attDocRef);
                  if (attSnap.exists()) {
                    const ad = attSnap.data() || {};
                    records.push({
                      date: dateId,
                      subjectId: subId,
                      subjectName: ad.subjectName || (availableSubjects.find((s) => s.id === subId)?.name) || subId,
                      remark: ad.remark || ad.status || ad.remarks || "",
                      time: ad.time || ad.timeIn || "",
                      timestamp: ad.timestamp ? (ad.timestamp.toDate ? ad.timestamp.toDate().getTime() : new Date(ad.timestamp).getTime()) : null,
                      raw: ad,
                    });
                  }
                } catch (err) {
                  // ignore per-item errors
                }
              })
            );
          })
        );

        // sort newest first by timestamp, fallback to date
        records.sort((a, b) => {
          const ta = a.timestamp || new Date(a.date + "T00:00:00").getTime();
          const tb = b.timestamp || new Date(b.date + "T00:00:00").getTime();
          return tb - ta;
        });

        if (!cancelled) setAttendanceEntries(records);
      } catch (err) {
        console.error("Failed loading attendance records:", err);
        if (!cancelled) setAttendanceEntries([]);
      } finally {
        if (!cancelled) setLoadingAttendance(false);
      }
    };

    // fetch once for current student and filters (date range / subject)
    fetchAllRecordsForStudent();
    return () => {
      cancelled = true;
    };
  }, [studentId, subjects, selectedSubject, startDate, endDate]);

  const initials = (s) => {
    const fn = s?.firstName || "";
    const ln = s?.lastName || "";
    if (!fn && !ln && s?.name) {
      const parts = s.name.split(" ");
      return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
    }
    return (fn[0] || "") + (ln[0] || "");
  };

  return (
    <div className="min-h-screen bg-white">
      <TopbarAdmin />
      <div className="flex">
        <SidebarAdmin />

        <main className="flex-1 p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-4">
              <button className="text-2xl font-bold text-blue-700" onClick={() => navigate(-1)}>←</button>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-700">
                  {student ? initials(student).toUpperCase() : "?"}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{student ? (student.name || `${student.firstName || ""} ${student.lastName || ""}`) : "Student"}</h1>
                  <div className="text-sm text-gray-600">ID: {student?.id || studentId || "—"}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="border px-3 py-2 rounded-md bg-white"
              >
                <option value="All">All Subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                ))}
              </select>

              <label className="text-sm">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border px-3 py-2 rounded-md bg-white"
              />

              <label className="text-sm">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border px-3 py-2 rounded-md bg-white"
              />

              <button
                className="ml-2 border px-3 py-2 rounded bg-gray-50"
                onClick={() => { setStartDate(""); setEndDate(""); setSelectedSubject("All"); }}
                title="Clear filters"
              >
                Clear
              </button>
            </div>
          </div>

          <section className="bg-gray-100 p-4 rounded-lg shadow mb-6">
            <h2 className="font-semibold mb-3">Student Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-black">
              <div><strong>RFID:</strong> {student?.rfid || "—"}</div>
              <div><strong>Year:</strong> {student?.year || student?.yearLevel || "—"}</div>
              <div><strong>Program:</strong> {student?.program || "—"}</div>
              <div><strong>Contact:</strong> {student?.contact || "—"}</div>
              <div><strong>Guardian:</strong> {student?.guardian || "—"}</div>
              <div><strong>Guardian Contact:</strong> {student?.guardianContact || "—"}</div>
            </div>
          </section>

          <section className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Attendance records</h3>
              <div className="text-sm text-gray-600">{loadingAttendance ? "Loading..." : `${attendanceEntries.length} record(s)`}</div>
            </div>

            {loadingAttendance ? (
              <div>Loading attendance...</div>
            ) : attendanceEntries.length === 0 ? (
              <div className="text-gray-600">No attendance records for this student (match current filters).</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto border border-gray-200 text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-2 px-4 border">Date</th>
                      <th className="py-2 px-4 border">Subject</th>
                      <th className="py-2 px-4 border">Status / Remark</th>
                      <th className="py-2 px-4 border">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceEntries.map((e, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-4">{e.date}</td>
                        <td className="py-2 px-4">{e.subjectName}</td>
                        <td className="py-2 px-4">{e.remark || "—"}</td>
                        <td className="py-2 px-4">{e.time || (e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default StudentInformation;

import React, { useEffect, useMemo, useState } from "react";
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
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  doc as firestoreDoc,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";

const Dashboard = () => {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString()
  );
  const [selectedMonth, setSelectedMonth] = useState("All");

  const [totalStudents, setTotalStudents] = useState(null);
  const [totalTeachers, setTotalTeachers] = useState(null);

  // today's subjects (active right now) with counts
  const [todaySubjects, setTodaySubjects] = useState([]);
  // flattened latest attendance entries across today's subjects (sorted desc by timestamp)
  const [latestTodayEntries, setLatestTodayEntries] = useState([]);
  // aggregated monthly chart data (Late, Absent, Present)
  const [chartData, setChartData] = useState([]);

  // use consistent 3-letter month abbreviations (matches chart keys)
  const months = ["All","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur.toString(), (cur - 1).toString(), (cur - 2).toString()];
  }, []);

  const getTodayDateString = () => {
    const t = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  };

  const getCurrentDayShort = () =>
    new Date().toLocaleDateString("en-US", { weekday: "short" }); // "Mon","Tue",...

  const getCurrentTimeHHMM = () => new Date().toTimeString().slice(0, 5); // "HH:MM"

  // === totals ===
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sSnap = await getDocs(collection(db, "students"));
        const iSnap = await getDocs(collection(db, "instructors"));
        if (!mounted) return;
        setTotalStudents(sSnap.size);
        setTotalTeachers(iSnap.size);
      } catch (err) {
        console.error("Failed to fetch totals:", err);
        if (mounted) {
          setTotalStudents(0);
          setTotalTeachers(0);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // === Today's subjects + counts + latest entries ===
  useEffect(() => {
    let cancelled = false;
    const dateStr = getTodayDateString();
    const dayShort = getCurrentDayShort();
    const nowHHMM = getCurrentTimeHHMM();

    const normalizeStatus = (raw) => {
      if (raw == null) return "Absent";
      const r = String(raw).trim().toLowerCase();
      if (!r) return "Absent";
      if (r.includes("absent")) return "Absent";
      if (r.includes("late")) return "Late";
      if (r.includes("present")) return "Present";
      return "Absent";
    };

    const fetchToday = async () => {
      try {
        // If current user is an instructor, determine the instructor doc (to restrict subjects)
        let instructorDoc = null;
        if (user?.uid) {
          try {
            const instrQ = query(collection(db, "instructors"), where("uid", "==", user.uid));
            const instrSnap = await getDocs(instrQ);
            if (!instrSnap.empty) {
              const d = instrSnap.docs[0];
              instructorDoc = { id: d.id, ...d.data() };
            }
          } catch (err) {
            console.warn("Failed to resolve instructor doc:", err);
          }
        }

        // load all subjects and pick active ones (and owned by instructor if applicable)
        const subsSnap = await getDocs(collection(db, "subjectList"));
        const activeSubjects = [];
        subsSnap.forEach((s) => {
          const data = s.data() || {};
          const days = Array.isArray(data.days) ? data.days : [];
          const matchesDay =
            days.includes(dayShort) ||
            days.includes(new Date().toLocaleDateString("en-US", { weekday: "long" }));
          const withinTime =
            !data.startTime || !data.endTime || (data.startTime <= nowHHMM && nowHHMM <= data.endTime);

          // ownership check: if instructorDoc exists, only include subjects the instructor owns
          let isOwned = true;
          if (instructorDoc) {
            const ownerChecks = [
              data.instructorUid,
              data.instructor,
              data.owner,
              data.instructorCode,
              s.id,
            ];
            // consider subject owned if any of these matches instructorDoc.uid or instructorDoc.id or instructorDoc.code
            isOwned = ownerChecks.some((v) => {
              if (!v) return false;
              if (v === user.uid) return true;
              if (v === instructorDoc.id) return true;
              if (instructorDoc.code && v === instructorDoc.code) return true;
              if (instructorDoc.instructorCode && v === instructorDoc.instructorCode) return true;
              return false;
            });
          }

          if (data.active !== false && matchesDay && withinTime && isOwned) {
            activeSubjects.push({ id: s.id, ...data });
          }
        });

        const subjectsWithCounts = [];
        let allEntries = [];

        for (const subj of activeSubjects) {
          // attendance path: attendance/{dateStr}/{subjectId} -> docs keyed by studentID
          const subjColRef = collection(db, "attendance", dateStr, subj.id);
          const attSnap = await getDocs(subjColRef);
          const counts = { Present: 0, Absent: 0, Late: 0, Total: 0 };
          const subjEntries = [];

          if (!attSnap.empty) {
            attSnap.forEach((d) => {
              const data = d.data() || {};
              const status = normalizeStatus(data.status ?? data.remark ?? data.remarks);
              counts[status] = (counts[status] || 0) + 1;
              const ts = data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().getTime() : new Date(data.timestamp).getTime()) : null;
              subjEntries.push({
                id: d.id,
                subjectCode: subj.id,
                subjectName: subj.name || subj.subject || subj.subjectName || subj.id,
                studentId: d.id,
                studentName: data.name || data.studentName || "",
                status,
                timeIn: data.time || data.timeIn || null,
                timestamp: ts,
                raw: data,
              });
            });
          }

          counts.Total = counts.Present + counts.Absent + counts.Late;
          subjectsWithCounts.push({
            subjectCode: subj.id,
            subjectName: subj.name || subj.subject || subj.subjectName || subj.id,
            startTime: subj.startTime || subj.start || "TBD",
            endTime: subj.endTime || subj.end || "TBD",
            counts,
            entries: subjEntries,
          });

          allEntries = allEntries.concat(subjEntries);
        }

        // sort allEntries by timestamp desc (fallback to timeIn)
        allEntries.sort((a, b) => {
          const ta = a.timestamp ?? (a.timeIn ? (() => { const [hh, mm] = (a.timeIn || "00:00").split(":").map(Number); const d = new Date(); d.setHours(hh, mm, 0, 0); return d.getTime(); })() : 0);
          const tb = b.timestamp ?? (b.timeIn ? (() => { const [hh, mm] = (b.timeIn || "00:00").split(":").map(Number); const d = new Date(); d.setHours(hh, mm, 0, 0); return d.getTime(); })() : 0);
          return tb - ta;
        });

        if (!cancelled) {
          setTodaySubjects(subjectsWithCounts);
          // only show latest 5 entries from subjects the instructor owns (activeSubjects already filtered)
          setLatestTodayEntries(allEntries.slice(0, 5));
        }
      } catch (err) {
        console.error("Failed to load today's activity:", err);
        if (!cancelled) {
          setTodaySubjects([]);
          setLatestTodayEntries([]);
        }
      }
    };

    fetchToday();
    return () => {
      cancelled = true;
    };
  }, [user]); // re-run when auth user changes

  // === Chart aggregation (simple): scan attendance date docs that belong to selectedYear and aggregate by month ===
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // prepare months
        const monthShorts = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "June",
          "July",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const map = {};
        monthShorts.forEach((m) => (map[m] = { month: m, Late: 0, Absent: 0, Present: 0 }));

        // fetch all attendance date documents (top-level); doc ids assumed "YYYY-MM-DD"
        const datesSnap = await getDocs(collection(db, "attendance"));
        const dateDocs = datesSnap.docs.map((d) => d.id).filter((id) => id.startsWith(selectedYear));

        // load subject list once for subcollection iteration
        const subsSnap = await getDocs(collection(db, "subjectList"));
        const subjectIds = subsSnap.docs.map((d) => d.id);

        // for each date in selected year, for each subject, count statuses
        for (const dateId of dateDocs) {
          // month index from dateId
          const parts = dateId.split("-");
          const mm = parts.length >= 2 ? Number(parts[1]) : NaN;
          const monthKey = !isNaN(mm) ? monthShorts[mm - 1] : null;
          if (!monthKey || !map[monthKey]) continue;

          for (const subjId of subjectIds) {
            try {
              const subjCol = collection(db, "attendance", dateId, subjId);
              const attSnap = await getDocs(subjCol);
              if (attSnap.empty) continue;
              attSnap.forEach((d) => {
                const data = d.data() || {};
                const raw = (data.status || data.remark || "").toString().toLowerCase();
                if (raw.includes("absent")) map[monthKey].Absent += 1;
                else if (raw.includes("late")) map[monthKey].Late += 1;
                else map[monthKey].Present += 1;
              });
            } catch (err) {
              // ignore subject missing or permission issues
            }
            if (cancelled) break;
          }
          if (cancelled) break;
        }

        const arr = Object.values(map);
        if (!cancelled) setChartData(arr);
      } catch (err) {
        console.error("Failed to build chart data:", err);
        if (!cancelled) setChartData([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  // helpers for rendering
  const totalsToday = useMemo(() => {
    const t = { Present: 0, Absent: 0, Late: 0, Total: 0 };
    todaySubjects.forEach((s) => {
      t.Present += s.counts.Present || 0;
      t.Absent += s.counts.Absent || 0;
      t.Late += s.counts.Late || 0;
    });
    t.Total = t.Present + t.Absent + t.Late;
    return t;
  }, [todaySubjects]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />

        <main className="flex-1 p-6">
          <h1 className="text-2xl font-bold mb-6 text-gray-800">Dashboard</h1>

          {/* TOP CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            <div className="bg-white shadow-md rounded-2xl p-5 flex flex-col items-center justify-center h-36 hover:shadow-lg transition-all duration-200">
              <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mb-3">
                <FaUsers className="text-blue-600 text-2xl" />
              </div>
              <p className="text-lg font-semibold text-gray-800">Total Students</p>
              <h2 className="text-3xl font-bold text-gray-800">{totalStudents ?? "…"}</h2>
            </div>

            <div className="bg-white shadow-md rounded-2xl p-5 flex flex-col items-center justify-center h-36 hover:shadow-lg transition-all duration-200">
              <div className="bg-green-100 rounded-full w-12 h-12 flex items-center justify-center mb-3">
                <FaChalkboardTeacher className="text-green-600 text-2xl" />
              </div>
              <p className="text-lg font-semibold text-gray-800">Total Teachers</p>
              <h2 className="text-3xl font-bold text-gray-800">{totalTeachers ?? "…"}</h2>
            </div>

            {/* Today's Activity expanded (replaces student breakdown) */}
            <div className="bg-white shadow-md rounded-2xl p-5 flex flex-col hover:shadow-lg transition-all duration-200">
              <h3 className="text-center font-semibold mb-3 text-gray-800">Today's Activity</h3>
              <div className="text-sm text-gray-700">
                {todaySubjects.length === 0 ? (
                  <div className="text-center text-gray-600">No subjects taking attendance right now.</div>
                ) : (
                  <ul className="space-y-3">
                    {todaySubjects.map((s) => (
                      <li key={s.subjectCode} className="flex justify-between items-center border-b py-2">
                        <div>
                          <div className="font-medium text-gray-800">{s.subjectName}</div>
                          <div className="text-xs text-gray-500">{s.startTime} - {s.endTime}</div>
                        </div>
                        <div className="text-right text-sm">
                          <div>Present: <span className="font-semibold text-blue-600">{s.counts.Present}</span></div>
                          <div>Absent: <span className="font-semibold text-red-600">{s.counts.Absent}</span></div>
                          <div>Late: <span className="font-semibold text-yellow-500">{s.counts.Late}</span></div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* GRAPH & latest entries */}
          <div className="grid grid-cols-1 lg:grid-cols-[2.1fr_1fr] gap-6 mb-6">
            <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition-all duration-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Attendance Issues Overview</h3>
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
                    {months.map((m) => (
                      // replace "No Logs" concept by "Present" label in UI where applicable
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Late" stroke="#facc15" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="Absent" stroke="#ef4444" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="Present" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* latest today's attendance entries (5 latest) */}
            <div className="bg-white shadow-md rounded-2xl p-6 flex flex-col hover:shadow-lg transition-all duration-200">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">Latest Attendance (Today)</h3>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left border-t">
                  <thead className="bg-gray-100 text-gray-600 uppercase">
                    <tr>
                      <th className="py-2 px-4">Student</th>
                      <th className="py-2 px-4">Subject</th>
                      <th className="py-2 px-4">Status</th>
                      <th className="py-2 px-4">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestTodayEntries.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-sm text-gray-500">No attendance records for today.</td>
                      </tr>
                    )}
                    {latestTodayEntries.map((e, idx) => (
                      <tr key={e.id || idx} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-4">{e.studentName || e.studentId || "—"}</td>
                        <td className="py-2 px-4">{e.subjectName || e.subjectCode}</td>
                        <td className={`py-2 px-4 font-medium ${e.status === "Present" ? "text-green-600" : e.status === "Absent" ? "text-red-600" : "text-yellow-600"}`}>{e.status}</td>
                        <td className="py-2 px-4">{e.timeIn || (e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "-")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Attendance Overview (today totals only) */}
          <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition-all duration-200">
            <h3 className="text-lg font-semibold mb-6 text-gray-800">Attendance Overview (Today)</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 text-center mb-6">
              <div>
                <p className="text-2xl font-bold text-blue-600">{totalsToday.Present}</p>
                <p className="text-gray-500 font-medium">Present</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{totalsToday.Absent}</p>
                <p className="text-gray-500 font-medium">Absent</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-500">{totalsToday.Late}</p>
                <p className="text-gray-500 font-medium">Late</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-700">{totalsToday.Total}</p>
                <p className="text-gray-500 font-medium">Total</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
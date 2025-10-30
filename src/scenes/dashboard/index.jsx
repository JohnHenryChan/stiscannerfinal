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
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { processStreaksFromLastRun } from "../../utils/processStreaks";

// dry-run: when true only logs planned writes (no writes to attendance/config)
const WRITE_ABSENCE_DRY_RUN = false;

// helper: format local YYYY-MM-DD
const formatDateLocal = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// helper: inclusive date iterator
const iterateDatesInclusive = function* (startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const cur = new Date(start);
  
  while (cur <= end) {
    yield new Date(cur);
    cur.setDate(cur.getDate() + 1);
  }
};

// Use AttendanceRecord logic for writing absence documents
const writeAbsenceDocumentsAttendanceRecord = async (fromDate, toDate) => {
  console.log(`📝 [WriteAbsence] Starting absence document creation from ${formatDateLocal(fromDate)} to ${formatDateLocal(toDate)}`);
  
  try {
    // Get all subjects (no role filtering)
    const subsSnap = await getDocs(collection(db, "subjectList"));
    const subjects = [];
    
    subsSnap.forEach(doc => {
      const data = doc.data();
      subjects.push({ id: doc.id, ...data });
    });
    
    console.log(`📝 [WriteAbsence] Processing ${subjects.length} subjects`);
    
    let totalAbsencesWritten = 0;
    const datesToProcess = Array.from(iterateDatesInclusive(fromDate, toDate));
    
    console.log(`📝 [WriteAbsence] Processing ${datesToProcess.length} dates`);
    
    for (const dateObj of datesToProcess) {
      const dateStr = formatDateLocal(dateObj);
      const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      
      console.log(`📝 [WriteAbsence] Processing date: ${dateStr} (${weekday})`);
      
      // ✅ CREATE/UPDATE THE PARENT DATE DOCUMENT FIRST
      const dateDocRef = doc(db, "attendance", dateStr);
      const dateDocData = {
        date: dateStr,                          // Date field in YYYY-MM-DD format
        dayOfWeek: weekday,                     // "Mon", "Tue", etc.
        timestamp: new Date(),                  // When this date document was created/updated
        processed: true,                        // Mark as processed
        processedBy: "system",                  // Who processed it
        lastUpdated: new Date(),                // Last update timestamp
        year: dateObj.getFullYear(),            // 2024
        month: dateObj.getMonth() + 1,          // 10 (October)
        day: dateObj.getDate()                  // 30
      };
      
      if (!WRITE_ABSENCE_DRY_RUN) {
        await setDoc(dateDocRef, dateDocData, { merge: true });
        console.log(`📅 [WriteAbsence] Created/updated parent date document: attendance/${dateStr}`);
      } else {
        console.log(`🧪 [WriteAbsence] DRY RUN: Would create/update parent date doc: attendance/${dateStr}`);
      }
      
      // Filter subjects by weekday
      const subjectsForDate = subjects.filter(s => {
        const isActive = s.active !== false;
        const hasDays = Array.isArray(s.days) && s.days.length > 0;
        const matchesDay = hasDays && s.days.includes(weekday);
        
        console.log(`📝 [WriteAbsence] Subject ${s.id}: active=${isActive}, hasDays=${hasDays}, matchesDay=${matchesDay}, days=${JSON.stringify(s.days)}`);
        
        return isActive && hasDays && matchesDay;
      });
      
      console.log(`📝 [WriteAbsence] Found ${subjectsForDate.length} subjects scheduled for ${weekday}`);
      
      for (const subject of subjectsForDate) {
        try {
          console.log(`📝 [WriteAbsence] Processing subject: ${subject.id} (${subject.subject || subject.name})`);
          
          // Get enrolled students for this subject
          const studentsSnap = await getDocs(collection(db, "subjectList", subject.id, "students"));
          const enrolledStudents = [];
          
          studentsSnap.forEach(doc => {
            enrolledStudents.push({
              id: doc.id,
              ...doc.data()
            });
          });
          
          console.log(`📝 [WriteAbsence] Found ${enrolledStudents.length} enrolled students in ${subject.id}`);
          
          // Check existing attendance records for this date/subject
          const attendanceSnap = await getDocs(collection(db, "attendance", dateStr, subject.id));
          const existingAttendance = new Set();
          
          attendanceSnap.forEach(doc => {
            existingAttendance.add(doc.id);
          });
          
          console.log(`📝 [WriteAbsence] Found ${existingAttendance.size} existing attendance records for ${dateStr}/${subject.id}`);
          
          // Find students without attendance records
          const absentStudents = enrolledStudents.filter(student => 
            !existingAttendance.has(student.id)
          );
          
          console.log(`📝 [WriteAbsence] Found ${absentStudents.length} students to mark absent`);
          
          // Write absence documents for missing students
          if (!WRITE_ABSENCE_DRY_RUN) {
            for (const student of absentStudents) {
              const absenceDoc = {
                // Student Information
                studentId: student.id,
                studentName: student.name || student.fullName || `Student ${student.id}`,
                
                // Attendance Status
                status: "Absent",
                remark: "Absent",
                remarks: "Absent",
                
                // Date & Time Information
                date: dateStr,                    // ✅ Date field in nested document too
                timestamp: new Date(),
                timeIn: null,
                timeOut: null,
                
                // Subject Information
                subjectId: subject.id,
                subjectName: subject.subject || subject.name || subject.id,
                subjectCode: subject.subjectCode || subject.id,
                
                // System Information
                createdBy: "system",
                reason: "auto-generated-absence",
                source: "dashboard-backlog-processing",
                
                // Additional tracking
                dayOfWeek: weekday,
                processed: true,
                isAutoGenerated: true
              };
              
              // Write to: attendance/{dateStr}/{subjectId}/{studentId}
              const absenceRef = doc(db, "attendance", dateStr, subject.id, student.id);
              await setDoc(absenceRef, absenceDoc);
              
              totalAbsencesWritten++;
              console.log(`📝 [WriteAbsence] Wrote absence for student ${student.id} in subject ${subject.id} on ${dateStr}`);
            }
          } else {
            console.log(`🧪 [WriteAbsence] DRY RUN: Would write ${absentStudents.length} absences for ${subject.id} on ${dateStr}`);
            totalAbsencesWritten += absentStudents.length;
          }
          
        } catch (subjectError) {
          console.error(`📝 [WriteAbsence] Error processing subject ${subject.id} on ${dateStr}:`, subjectError);
        }
      }
    }
    
    console.log(`✅ [WriteAbsence] Completed. Total absences written: ${totalAbsencesWritten}`);
    return { success: true, absencesWritten: totalAbsencesWritten, datesProcessed: datesToProcess.length };
    
  } catch (error) {
    console.error(`🔥 [WriteAbsence] Failed:`, error);
    throw error;
  }
};

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();

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

  // Add state for instructor filtering
  const [userRole, setUserRole] = useState(null);
  const [ownedSubjectIds, setOwnedSubjectIds] = useState([]);

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

  // Console logging helper
  console.log("🚀 [Dashboard] Component rendered");
  console.log("👤 [Dashboard] Current user:", user);
  console.log("⏳ [Dashboard] Auth loading:", authLoading);

  // === Fetch user role and owned subjects ===
  useEffect(() => {
    const fetchUserRoleAndSubjects = async () => {
      if (!user?.uid) {
        setUserRole(null);
        setOwnedSubjectIds([]);
        return;
      }

      try {
        // Get user role from multiple possible sources
        let role = user.role || "student";
        let ownedIds = [];

        // Check instructors collection for role and owned subjects
        let instrDoc = await getDoc(doc(db, "instructors", user.uid));
        
        // Fallback: query by uid if document doesn't exist by uid
        if (!instrDoc.exists()) {
          const instrQuery = query(collection(db, "instructors"), where("uid", "==", user.uid));
          const instrSnap = await getDocs(instrQuery);
          if (!instrSnap.empty) {
            instrDoc = instrSnap.docs[0];
          }
        }

        if (instrDoc.exists()) {
          const instrData = instrDoc.data();
          role = instrData.role || "instructor";
          
          // Get owned subjects for instructors
          if (role === "instructor") {
            const subjectList = instrData.subjectList || [];
            ownedIds = Array.isArray(subjectList) ? subjectList.map(String) : [];
          }
        }

        // Check other role collections if not found in instructors
        if (role === "student") {
          // Check admins collection
          const adminDoc = await getDoc(doc(db, "admins", user.uid));
          if (adminDoc.exists()) {
            role = "admin";
          } else {
            // Check other collections as needed
            const guidanceDoc = await getDoc(doc(db, "guidance", user.uid));
            if (guidanceDoc.exists()) {
              role = "guidance";
            }
          }
        }

        console.log("[Dashboard] User role and subjects:", { 
          uid: user.uid, 
          role, 
          ownedSubjects: ownedIds 
        });

        setUserRole(role);
        setOwnedSubjectIds(ownedIds);

      } catch (err) {
        console.error("[Dashboard] Failed to fetch user role/subjects:", err);
        setUserRole("student");
        setOwnedSubjectIds([]);
      }
    };

    fetchUserRoleAndSubjects();
  }, [user]);

  // === Dashboard Processing with AttendanceRecord logic ===
  useEffect(() => {
    console.log("🔄 [Dashboard] Starting dashboard processing...");
    
    if (authLoading) {
      console.log("⏳ [Dashboard] Waiting for auth to complete...");
      return;
    }

    if (!user) {
      console.warn("❌ [Dashboard] No user found, skipping processing");
      return;
    }

    console.log("✅ [Dashboard] User authenticated, starting processing");
    console.log("📊 [Dashboard] User details:", {
      uid: user.uid,
      email: user.email,
      name: user.name,
      role: user.role
    });

    const runDashboardProcessing = async () => {
      try {
        // Get current PH time
        const now = new Date();
        const phNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const todayStr = formatDateLocal(phNow);
        const today = new Date(phNow.getFullYear(), phNow.getMonth(), phNow.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        
        console.log("📅 [Dashboard] Current PH date:", todayStr);
        console.log("🕐 [Dashboard] Current PH time:", phNow.toLocaleString());

        // Check system/attendance config
        console.log("🔍 [Dashboard] Checking system/attendance config...");
        const cfgRef = doc(db, "system", "attendance");
        const cfgSnap = await getDoc(cfgRef);
        const cfg = cfgSnap.exists() ? cfgSnap.data() : {};
        
        console.log("📋 [Dashboard] Current config:", cfg);

        // Handle writeAbsence using AttendanceRecord logic
        const storedWriteDate = cfg.writeAbsence || null;
        console.log("📝 [Dashboard] Write absence last run:", storedWriteDate);

        // Convert stored date to Date object for comparison
        let normalizedStoredDate;
        if (storedWriteDate) {
          normalizedStoredDate = new Date(storedWriteDate + "T00:00:00");
          if (isNaN(normalizedStoredDate.getTime())) {
            console.warn("📝 [Dashboard] Invalid stored date, treating as null");
            normalizedStoredDate = null;
          }
        } else {
          normalizedStoredDate = null;
        }

        console.log("📝 [Dashboard] Normalized stored date:", normalizedStoredDate);
        console.log("📝 [Dashboard] Today:", today);
        console.log("📝 [Dashboard] Yesterday:", yesterday);

        // Determine if we need to process writeAbsence
        let needsWriteAbsence = false;
        let fromDate = null;
        let toDate = null;

        if (!normalizedStoredDate) {
          console.log("📝 [Dashboard] No stored date found, processing from yesterday only");
          needsWriteAbsence = true;
          fromDate = yesterday;
          toDate = yesterday;
        } else if (normalizedStoredDate < yesterday) {
          console.log("📝 [Dashboard] Stored date is before yesterday, processing backlog");
          needsWriteAbsence = true;
          // Start from the day AFTER stored date
          fromDate = new Date(normalizedStoredDate);
          fromDate.setDate(fromDate.getDate());
          toDate = yesterday;
        } else if (formatDateLocal(normalizedStoredDate) === formatDateLocal(yesterday)) {
          console.log("📝 [Dashboard] Stored date is yesterday, already up to date");
          needsWriteAbsence = false;
        } else if (normalizedStoredDate >= today) {
          console.log("📝 [Dashboard] Stored date is today or future, nothing to process");
          needsWriteAbsence = false;
        }

        if (needsWriteAbsence) {
          console.log(`📝 [Dashboard] Write absence needed from ${formatDateLocal(fromDate)} to ${formatDateLocal(toDate)}`);
          
          // ✅ Actually write absence documents using AttendanceRecord logic
          console.log("📝 [Dashboard] Writing absence documents using AttendanceRecord logic...");
          
          const writeResult = await writeAbsenceDocumentsAttendanceRecord(fromDate, toDate);
          console.log("✅ [Dashboard] Absence documents written:", writeResult);
          
          // Update config after successful write
          if (!WRITE_ABSENCE_DRY_RUN) {
            console.log("✍️ [Dashboard] Updating writeAbsence config...");
            await setDoc(cfgRef, { writeAbsence: formatDateLocal(toDate) }, { merge: true });
            console.log("✅ [Dashboard] WriteAbsence config updated successfully");
          } else {
            console.log("🧪 [Dashboard] DRY RUN mode - config not updated");
          }
        } else {
          console.log("✅ [Dashboard] Write absence already up to date");
        }

        // ⚡ WAIT for writeAbsence to complete before processing streaks
        console.log("🔢 [Dashboard] Starting streak processing (after writeAbsence completion)...");
        
        try {
          const streakResult = await processStreaksFromLastRun(user.uid);
          
          if (streakResult === null) {
            console.log("⏭️ [Dashboard] Streak processing skipped (already done or lease active)");
          } else {
            console.log("✅ [Dashboard] Streak processing completed successfully:", streakResult);
          }
        } catch (streakError) {
          console.error("🔥 [Dashboard] Streak processing failed:", streakError);
        }

      } catch (error) {
        console.error("🔥 [Dashboard] Overall processing failed:", error);
        console.error("🔥 [Dashboard] Error details:", {
          message: error.message,
          code: error.code,
          stack: error.stack
        });
      }
      
      console.log("🏁 [Dashboard] Dashboard processing completed");
    };

    runDashboardProcessing();
  }, [user, authLoading]);

  // === totals (not filtered by instructor) ===
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        console.log("📊 [Dashboard] Loading totals...");
        const sSnap = await getDocs(collection(db, "students"));
        const iSnap = await getDocs(collection(db, "instructors"));
        if (!mounted) return;
        setTotalStudents(sSnap.size);
        setTotalTeachers(iSnap.size);
        console.log("📊 [Dashboard] Totals loaded - Students:", sSnap.size, "Teachers:", iSnap.size);
      } catch (err) {
        console.error("🔥 [Dashboard] Failed to fetch totals:", err);
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

  // === Today's subjects + counts + latest entries (with instructor filtering) ===
  useEffect(() => {
    let cancelled = false;
    const dateStr = getTodayDateString();
    const dayShort = getCurrentDayShort();
    const nowHHMM = getCurrentTimeHHMM();

    console.log("[Dashboard] fetchToday start", { dateStr, dayShort, nowHHMM, userRole, ownedSubjectIds });

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
        console.log("📚 [Dashboard] Loading today's subjects...");
        // load all subjects and pick active ones
        const subsSnap = await getDocs(collection(db, "subjectList"));
        console.log("[Dashboard] loaded subjectList count:", subsSnap.size);

        let activeSubjects = [];
        subsSnap.forEach((s) => {
          const raw = s.data() || {};
          // normalize days to array of trimmed lowercase strings for reliable matching
          const days = Array.isArray(raw.days)
            ? raw.days.map(d => (typeof d === "string" ? d.trim().toLowerCase() : "")).filter(Boolean)
            : [];
          const todayShortLower = dayShort.toLowerCase();
          const todayLongLower = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

          const matchesDay = days.includes(todayShortLower) || days.includes(todayLongLower);

          // safe time checks: treat missing start/end as always within time
          const startTime = raw.startTime ? String(raw.startTime).trim() : null;
          const endTime = raw.endTime ? String(raw.endTime).trim() : null;
          let withinTime = true;
          if (startTime && endTime) {
            try {
              withinTime = startTime <= nowHHMM && nowHHMM <= endTime;
            } catch (e) {
              withinTime = true;
            }
          }

          const activeFlag = raw.active !== false;

          // Debug log for each subject evaluation
          console.log("[Dashboard] subject check", {
            id: s.id,
            subjectName: raw.name || raw.subject || raw.subjectName,
            days,
            matchesDay,
            startTime,
            endTime,
            withinTime,
            activeFlag
          });

          if (activeFlag && matchesDay && withinTime) {
            activeSubjects.push({ id: s.id, ...raw });
          } else {
            const reasons = [];
            if (!activeFlag) reasons.push("inactive");
            if (!matchesDay) reasons.push("wrong day");
            if (!withinTime) reasons.push("out of time range");
            console.log(`[Dashboard] skipping subject ${s.id} (${raw.subject || raw.name || s.id})`, reasons.join(", "));
          }
        });

        console.log("[Dashboard] activeSubjects count before instructor filtering:", activeSubjects.length);

        // Apply instructor filtering (only if instructor role)
        if (userRole === "instructor") {
          if (!ownedSubjectIds || ownedSubjectIds.length === 0) {
            console.log("[Dashboard] Instructor has no owned subjects, showing empty list");
            activeSubjects = [];
          } else {
            activeSubjects = activeSubjects.filter(subj => {
              const sid = String(subj.id);
              const scode = String(subj.subjectCode || sid);
              const isOwned = ownedSubjectIds.includes(sid) || ownedSubjectIds.includes(scode);
              console.log(`[Dashboard] Subject ${sid} (${subj.subject || subj.name}) owned by instructor: ${isOwned}`);
              return isOwned;
            });
          }
        }

        console.log("[Dashboard] activeSubjects count after filtering:", activeSubjects.length);

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
          // only show latest 5 entries
          setLatestTodayEntries(allEntries.slice(0, 5));
          console.log("[Dashboard] set todaySubjects and latestTodayEntries", {
            subjectCount: subjectsWithCounts.length,
            latestCount: allEntries.slice(0, 5).length
          });
        }
      } catch (err) {
        console.error("🔥 [Dashboard] Failed to load today's activity:", err);
        if (!cancelled) {
          setTodaySubjects([]);
          setLatestTodayEntries([]);
        }
      }
    };

    // Only fetch when we have role information
    if (userRole !== null) {
      fetchToday();
    }

    return () => {
      cancelled = true;
    };
  }, [user, userRole, ownedSubjectIds]); // Added dependencies for filtering

  // === Chart aggregation (NO filtering - show all data) ===
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log("📈 [Dashboard] Building chart data for year:", selectedYear, "(no filtering)");
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

        console.log("📈 [Dashboard] Found", dateDocs.length, "date documents for", selectedYear);

        // load subject list (NO filtering - show all subjects in chart)
        const subsSnap = await getDocs(collection(db, "subjectList"));
        const subjectIds = subsSnap.docs.map((d) => d.id);

        console.log("📈 [Dashboard] Processing chart for", subjectIds.length, "subjects (all subjects)");

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
        if (!cancelled) {
          setChartData(arr);
          console.log("📈 [Dashboard] Chart data updated for", selectedYear, "(all subjects)");
        }
      } catch (err) {
        console.error("🔥 [Dashboard] Failed to build chart data:", err);
        if (!cancelled) setChartData([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear]); // Removed role-based filtering dependencies

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
                  <div className="text-center text-gray-600">
                    No subjects taking attendance right now.
                  </div>
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
                    {months.map((m) => (
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
              <h3 className="text-lg font-semibold mb-4 text-gray-800">
                Latest Attendance (Today)
              </h3>

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
                        <td colSpan={4} className="py-4 text-center text-sm text-gray-500">
                          No attendance records for today.
                        </td>
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
            <h3 className="text-lg font-semibold mb-6 text-gray-800">
              Attendance Overview (Today)
            </h3>

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
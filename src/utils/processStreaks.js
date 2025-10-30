import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

const TZ = "Asia/Manila";
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const toLocal = (d, tz = TZ) => new Date(d.toLocaleString("en-US", { timeZone: tz }));
const fmtYMD = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parseYMD = (s) => {
  const [Y,M,D] = s.split("-").map(Number);
  const utc = new Date(Date.UTC(Y, (M||1)-1, D||1));
  return toLocal(utc, TZ);
};
const addDaysYMD = (s, n) => {
  const d = parseYMD(s);
  d.setDate(d.getDate()+n);
  d.setHours(0,0,0,0);
  return fmtYMD(d);
};
const yesterdayYMD = () => {
  const now = toLocal(new Date(), TZ);
  now.setDate(now.getDate()-1);
  now.setHours(0,0,0,0);
  return fmtYMD(now);
};
const normDays = (days) =>
  (Array.isArray(days) ? days : [])
    .map((x) => (typeof x === "string" ? x.slice(0,3) : x))
    .map((x) => (x ? x[0].toUpperCase()+x.slice(1).toLowerCase() : x))
    .filter(Boolean);

/**
 * Processes streaks from last run to yesterday.
 * - Per-subject streaks are stored in subjectList/{subjectId}/students/{studentId}
 * - Global streak stored at students/{sid}/streaks/global
 * - Global increments only if student had >=1 scheduled, active class and attended none that day.
 * - Streaks reset to 0 after reaching 3 (instead of continuing to count)
 */
export async function processStreaksFromLastRun(currentUserId) {
  console.log("🔢 [processStreaks] Starting streak processing for user:", currentUserId);
  
  const cfgRef = doc(db, "system", "attendance");

  // Acquire lease and compute range using existing writeAbsence marker
  const { startDay, endDay } = await runTransaction(db, async (tx) => {
    console.log("🔒 [processStreaks] Acquiring transaction lock...");
    
    const snap = await tx.get(cfgRef);
    const cfg = snap.exists() ? snap.data() : {};
    const end = yesterdayYMD();

    console.log("📋 [processStreaks] Current system config:", cfg);
    console.log("📅 [processStreaks] Yesterday (end date):", end);

    const lastAbsence = cfg.writeAbsence || null;   // existing field in your dashboard
    const lastStreak = cfg.streaksLastRun || null;  // new

    console.log("📝 [processStreaks] Last absence run:", lastAbsence);
    console.log("🔢 [processStreaks] Last streak run:", lastStreak);

    // Fixed logic: use the more recent of lastStreak OR lastAbsence, but don't go beyond yesterday
    let start;
    if (lastStreak) {
      // If we have a streak run, continue from day after
      start = addDaysYMD(lastStreak, 1);
    } else if (lastAbsence && parseYMD(lastAbsence).getTime() < parseYMD(end).getTime()) {
      // If we have absence run that's before yesterday, start from day after absence
      start = addDaysYMD(lastAbsence, 1);
    } else {
      // No previous runs or absence is today/future, just process yesterday
      start = end;
    }

    console.log("📅 [processStreaks] Calculated start date:", start);

    const now = Date.now();
    const lease = cfg.streaksProcessing;
    const leaseValid = lease && typeof lease.until === "number" && lease.until > now;
    
    if (leaseValid) {
      console.log("🔒 [processStreaks] Active lease found, skipping:", lease);
      return { startDay: null, endDay: null };
    }

    if (parseYMD(start).getTime() > parseYMD(end).getTime()) {
      console.log("⏭️ [processStreaks] Start > End, nothing to process");
      return { startDay: null, endDay: null };
    }

    console.log("🔒 [processStreaks] Setting processing lease...");
    tx.set(
      cfgRef,
      { streaksProcessing: { by: currentUserId, until: now + 5 * 60 * 1000 } },
      { merge: true }
    );
    return { startDay: start, endDay: end };
  });

  if (!startDay || !endDay) {
    console.log("🚫 [processStreaks] No processing needed, exiting");
    return null;
  }

  console.log("🎯 [processStreaks] Processing date range:", startDay, "to", endDay);

  try {
    for (
      let day = startDay;
      parseYMD(day).getTime() <= parseYMD(endDay).getTime();
      day = addDaysYMD(day, 1)
    ) {
      console.log("📅 [processStreaks] Processing day:", day);
      
      const dow = DOW[toLocal(new Date(`${day}T00:00:00`), TZ).getDay()];
      console.log("📅 [processStreaks] Day of week:", dow);

      // Load subjects once per day; filter to active + meets on this day
      console.log("📚 [processStreaks] Loading subjects for", day);
      const subsSnap = await getDocs(collection(db, "subjectList"));
      const subjects = subsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => {
          const active = s.active !== false;
          const meetsDow = normDays(s.days).includes(dow);
          console.log(`📚 [processStreaks] Subject ${s.id}: active=${active}, meetsDow=${meetsDow}, days=${JSON.stringify(s.days)}`);
          return active && meetsDow;
        });

      console.log("📚 [processStreaks] Active subjects for", day, ":", subjects.length);

      // For global streak: studentId -> { scheduled, attended }
      const globalAgg = new Map();

      let batch = writeBatch(db);
      let ops = 0;
      const flush = async () => {
        if (ops >= 450) {
          console.log("💾 [processStreaks] Flushing batch at", ops, "operations");
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      };

      for (const subj of subjects) {
        const subjectId = subj.id;
        console.log("📖 [processStreaks] Processing subject:", subjectId);

        // Membership: subjectList/{subjectId}/students
        const rosterSnap = await getDocs(collection(db, "subjectList", subjectId, "students"));
        const roster = new Set(rosterSnap.docs.map((d) => d.id));
        console.log("👥 [processStreaks] Subject", subjectId, "roster size:", roster.size);

        // Attendance for the day+subject
        const attSnap = await getDocs(collection(db, "attendance", day, subjectId));
        console.log("📊 [processStreaks] Attendance records for", day, subjectId, ":", attSnap.size);
        
        if (attSnap.empty) {
          console.log("📊 [processStreaks] No attendance records, skipping");
          continue;
        }

        for (const rec of attSnap.docs) {
          const studentId = rec.id;
          
          if (!roster.has(studentId)) {
            console.log("👥 [processStreaks] Student", studentId, "not in roster, skipping");
            continue; // not enrolled; skip
          }

          const data = rec.data() || {};
          const raw = String(data.remark ?? data.status ?? data.remarks ?? "").toLowerCase();
          const status = raw.includes("absent") ? "Absent" : raw.includes("late") ? "Late" : "Present";
          
          console.log("👤 [processStreaks] Student", studentId, "status:", status, "raw:", raw);

          // Per-subject streak stored on the subject's students/{studentId} doc
          const subjStudentRef = doc(db, "subjectList", subjectId, "students", studentId);
          const subjStudentSnap = rosterSnap.docs.find((d) => d.id === studentId);
          const prev = subjStudentSnap?.data() || {};
          const prevStreak = Number(prev.streak || 0);
          
          // ✨ NEW LOGIC: Reset to 0 after reaching 3
          let nextStreak;
          if (status === "Absent") {
            if (prevStreak >= 3) {
              // If already at 3 or more, reset to 1 (this absence starts a new streak)
              nextStreak = 1;
              console.log("🔄 [processStreaks] Resetting streak after 3+ for", studentId, ":", prevStreak, "-> 1");
            } else {
              // Normal increment
              nextStreak = prevStreak + 1;
            }
          } else {
            // Present or Late - reset to 0
            nextStreak = 0;
          }

          console.log("🔢 [processStreaks] Subject streak for", studentId, ":", prevStreak, "->", nextStreak);

          const subjUpdate = {
            id: studentId,
            streak: nextStreak,
            lastStatus: status,
            lastDate: day,
            updatedAt: serverTimestamp(),
            // Only trigger notification when reaching exactly 3 (not when resetting from 3+)
            ...(nextStreak === 3 && !prev.triggeredAt3 ? { triggeredAt3: serverTimestamp() } : {}),
            // Clear triggered flag when streak resets
            ...(nextStreak === 0 ? { triggeredAt3: null } : {}),
          };

          batch.set(subjStudentRef, subjUpdate, { merge: true });
          ops++;

          // Create notification only when reaching exactly 3
          if (nextStreak === 3 && !prev.triggeredAt3) {
            console.log("🚨 [processStreaks] Subject streak hit 3! Creating notification for", studentId, "in", subjectId);
            const notifRef = doc(collection(db, "notifications"));
            batch.set(notifRef, {
              type: "absent3_subject",
              studentId,
              subjectId,
              date: day,
              streak: 3,
              createdAt: serverTimestamp(),
              resolved: false,
            });
            ops++;
          }

          // Global aggregation (only scheduled classes count)
          const agg = globalAgg.get(studentId) || { scheduled: 0, attended: 0 };
          agg.scheduled += 1;
          if (status === "Present" || status === "Late") agg.attended += 1;
          globalAgg.set(studentId, agg);

          await flush();
        }
      }

      console.log("🌍 [processStreaks] Processing global streaks for", globalAgg.size, "students");

      // Global streak updates: only if student had >= 1 scheduled class that day
      for (const [studentId, agg] of globalAgg.entries()) {
        if (agg.scheduled === 0) {
          console.log("🌍 [processStreaks] Student", studentId, "had no scheduled classes, skipping global");
          continue;
        }
        
        const attendedAny = agg.attended > 0;
        console.log("🌍 [processStreaks] Student", studentId, "global:", agg, "attendedAny:", attendedAny);

        const gRef = doc(db, "students", studentId, "streaks", "global");
        const gSnap = await getDoc(gRef);
        const gPrev = gSnap.exists() ? (gSnap.data() || {}) : {};
        const gPrevStreak = Number(gPrev.streak || 0);
        
        // ✨ NEW LOGIC: Reset global streak to 0 after reaching 3
        let next;
        if (attendedAny) {
          // Student attended at least one class - reset streak
          next = 0;
        } else {
          // Student missed all classes
          if (gPrevStreak >= 3) {
            // If already at 3 or more, reset to 1 (this absence starts a new streak)
            next = 1;
            console.log("🔄 [processStreaks] Resetting global streak after 3+ for", studentId, ":", gPrevStreak, "-> 1");
          } else {
            // Normal increment
            next = gPrevStreak + 1;
          }
        }

        console.log("🌍 [processStreaks] Global streak for", studentId, ":", gPrevStreak, "->", next);

        const gUpdate = {
          streak: next,
          lastStatusDay: attendedAny ? "NonAbsent" : "Absent",
          lastDate: day,
          updatedAt: serverTimestamp(),
          // Only trigger notification when reaching exactly 3
          ...(next === 3 && !gPrev.triggeredAt3 ? { triggeredAt3: serverTimestamp() } : {}),
          // Clear triggered flag when streak resets
          ...(next === 0 ? { triggeredAt3: null } : {}),
        };
        batch.set(gRef, gUpdate, { merge: true });
        ops++;

        // Create notification only when reaching exactly 3
        if (next === 3 && !gPrev.triggeredAt3) {
          console.log("🚨 [processStreaks] Global streak hit 3! Creating notification for", studentId);
          const notifRef = doc(collection(db, "notifications"));
          batch.set(notifRef, {
            type: "absent3_global",
            studentId,
            date: day,
            streak: 3,
            createdAt: serverTimestamp(),
            resolved: false,
          });
          ops++;
        }

        if (ops >= 450) {
          console.log("💾 [processStreaks] Flushing batch at", ops, "operations");
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }

      if (ops > 0) {
        console.log("💾 [processStreaks] Final flush for day", day, "with", ops, "operations");
        await batch.commit();
      }
      
      console.log("✅ [processStreaks] Completed processing for day:", day);
    }

    // Mark complete and clear lease
    console.log("🏁 [processStreaks] Marking completion and clearing lease");
    await setDoc(cfgRef, { streaksLastRun: endDay, streaksProcessing: null }, { merge: true });
    
    console.log("✅ [processStreaks] Successfully completed processing from", startDay, "to", endDay);
    return { startDay, endDay };
  } catch (e) {
    console.error("🔥 [processStreaks] Error during processing:", e);
    console.log("🔓 [processStreaks] Clearing lease due to error");
    await setDoc(cfgRef, { streaksProcessing: null }, { merge: true });
    throw e;
  }
}

function getAttendanceStatus(status) {
  const raw = String(status ?? "").toLowerCase();
  if (raw.includes("absent")) return "Absent";
  if (raw.includes("late")) return "Late";
  return "Present";
}
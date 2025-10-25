import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  doc,
  getDoc,
  getDocs,
  query,
  collection,
  where,
  setDoc,
  Timestamp,
  FieldPath
} from "firebase/firestore";
import { db, storage } from "../../firebaseConfig";
import { ref, getDownloadURL } from "firebase/storage";
import * as faceapi from "face-api.js";

const MATCH_THRESHOLD = 0.5;
const DETECTION_INTERVAL_MS = 3000; // 3s detection interval
const COOLDOWN_SECONDS = 5;
const MAX_ATTEMPTS = 5;

const IDScanner = () => {
  // UI / state
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showStudentCard, setShowStudentCard] = useState(null);
  const [allStudents, setAllStudents] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);

  // readiness states (new)
  const [dataLoaded, setDataLoaded] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const systemReady = dataLoaded && modelsLoaded;
  const systemReadyRef = useRef(false);
  useEffect(() => { systemReadyRef.current = systemReady; }, [systemReady]);

  const [subjectChoices, setSubjectChoices] = useState([]);
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [pendingStudent, setPendingStudent] = useState(null);
  const pendingStudentRef = useRef(null); // <-- new
  const subjectRef = useRef(null); // <-- track currently selected subject (sync)
  
  const [faceModalOpen, setFaceModalOpen] = useState(false);
  const [faceAttempts, setFaceAttempts] = useState(0);
  const faceAttemptsRef = useRef(0);

  const [cameraLoading, setCameraLoading] = useState(false);
  const [lastAttemptStatus, setLastAttemptStatus] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  // closing/animation states
  const [cardClosing, setCardClosing] = useState(false);
  const [subjectClosing, setSubjectClosing] = useState(false);
  const [faceClosing, setFaceClosing] = useState(false);

  // video/canvas/stream/descriptor refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const refDescriptorRef = useRef(null);
  const loopIntervalRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const detectingRef = useRef(false);
  const framesDrawnRef = useRef(0);
  const preloadedStreamRef = useRef(false); // <-- new: indicates stream was preloaded during startup
  const preloadedVideoRef = useRef(null); // <-- hidden video element that holds the preloaded stream
  const cdIntervalRef = useRef(null); // <-- cooldown interval ref (so we can clear it on close)

  // For face modal timer
  const [faceLastActivity, setFaceLastActivity] = useState(Date.now());

  const navigate = useNavigate();

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /** ---------------------- AUTO CLOSE MODALS ---------------------- */
  // Auto-close student card after 5s
  useEffect(() => {
    if (showStudentCard) {
      const t = setTimeout(() => {
        setCardClosing(true);
        setTimeout(() => {
          setShowStudentCard(null);
          setCardClosing(false);
        }, 300);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [showStudentCard]);

  // Auto-close subject modal after 10s
  useEffect(() => {
    if (subjectModalOpen) {
      const t = setTimeout(() => {
        setSubjectClosing(true);
        setTimeout(() => {
          setSubjectModalOpen(false);
          setSubjectClosing(false);
        }, 300);
      }, 10000);
      return () => clearTimeout(t);
    }
  }, [subjectModalOpen]);

  // Auto-close face modal after 15s of inactivity, timer starts after camera loads and resets on activity
  useEffect(() => {
    if (faceModalOpen && !cameraLoading) {
      const interval = setInterval(() => {
        if (Date.now() - faceLastActivity > 15000) {
          setFaceClosing(true);
          setTimeout(() => {
            setFaceModalOpen(false);
            setFaceClosing(false);
          }, 300);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [faceModalOpen, cameraLoading, faceLastActivity]);

  /** ---------------------- DATA HELPERS ---------------------- */
  useEffect(() => {
    const loadAllStudents = async () => {
      try {
        const snapshot = await getDocs(collection(db, "students"));
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setAllStudents(data);
        console.log(`Loaded ${data.length} students from Firestore`);
        // additional debug: list of rfids -> student id
        console.log("Cached students (sample):", data.slice(0,50).map(s => ({ id: s.id, rfid: s.rfid, name: s.name || `${s.firstName || ""} ${s.lastName || ""}`.trim() })));
      } catch (err) {
        console.error("Error loading student data:", err);
        setError("Failed to load student data.");
      }
    };

    loadAllStudents();
  }, []); // only runs once

  useEffect(() => {
    const preloadData = async () => {
      try {
        // ---- Load all students
        const studentSnap = await getDocs(collection(db, "students"));
        const students = studentSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // debug: show how many and sample rfids
        console.log(`Preload: fetched ${students.length} students`);
        console.log("Preload: student rfids sample:", students.slice(0,50).map(s => ({ id: s.id, rfid: s.rfid })));

        // ---- Load all subjects + enrolled student IDs
        const subjectSnap = await getDocs(collection(db, "subjectList"));
        const subjects = [];
        for (const subjDoc of subjectSnap.docs) {
          const subjData = { id: subjDoc.id, ...subjDoc.data() };
          // support both 'students' and 'studentList' subcollections
          const studentsCol = collection(db, "subjectList", subjDoc.id, "students");
          const enrolled = await getDocs(studentsCol);
          // fallback to studentList if students subcollection empty
          if (enrolled.empty) {
            const altCol = collection(db, "subjectList", subjDoc.id, "studentList");
            const altSnap = await getDocs(altCol);
            subjData.studentIds = altSnap.docs.map(d => d.id);
          } else {
            subjData.studentIds = enrolled.docs.map(d => d.id);
          }
          subjects.push(subjData);
        }

        setAllStudents(students);
        setAllSubjects(subjects);
        console.log(`Cached ${students.length} students & ${subjects.length} subjects.`);
        console.log("Cached subjects (sample):", subjects.slice(0,50).map(s => ({ id: s.id, subject: s.subject || s.name, studentCount: (s.studentIds||[]).length })));

        // explicit full-cache debug (trimmed samples to avoid huge logs)
        console.log("[Cache] allStudents count:", students.length);
        console.log("[Cache] sample students:", students.slice(0,50).map(s => ({ id: s.id, rfid: s.rfid, name: s.name || `${s.firstName||''} ${s.lastName||''}`.trim() })));
        console.log("[Cache] allSubjects count:", subjects.length);
        console.log("[Cache] sample subjects:", subjects.slice(0,50).map(s => ({ id: s.id, subject: s.subject || s.name, studentCount: (s.studentIds||[]).length })));

        // MARK DATA AS LOADED -> enables scanner when models also loaded
        setDataLoaded(true);
        console.log("[Startup] dataLoaded = true");
      } catch (err) {
        console.error("Startup data load failed:", err);
        setError("Failed to load initial data.");
        setDataLoaded(false);
      }
    };

    // mark not-ready while starting preload
    setDataLoaded(false);
    preloadData();
  }, []);

// load face-api models before enabling scanning
  useEffect(() => {
    let mounted = true;
    const loadModels = async () => {
      try {
        console.log("[Startup] Loading face-api models from /models (tiny, ssd, landmarks, recognition)...");

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        console.log("[Startup] face-api models loaded");
        if (mounted) {
          setModelsLoaded(true);
          console.log("[Startup] modelsLoaded = true");
        }
      } catch (err) {
        console.error("[Startup] Failed loading face-api models:", err);
        if (mounted) {
          setModelsLoaded(false);
          setError("Failed to load face recognition models.");
        }
      }
    };

    setModelsLoaded(false);
    loadModels();
    return () => { mounted = false; };
  }, []);

// small readiness logger to help debugging why overlay persists
  useEffect(() => {
    console.log("[Startup] readiness", { dataLoaded, modelsLoaded, systemReady });
  }, [dataLoaded, modelsLoaded, systemReady]);

  // Preload camera on mount so permission prompt + stream are warmed before first face modal
  useEffect(() => {
    let cancelled = false;
    const preloadCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        console.debug("[Startup] getUserMedia not available");
        return;
      }
      if (streamRef.current) return;
      try {
        console.debug("[Startup] attempting camera preload...");
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
          return;
        }

        // attach the stream to a hidden video element so autoplay/policy is satisfied
        try {
          const hidden = document.createElement("video");
          hidden.muted = true;
          hidden.playsInline = true;
          hidden.autoplay = true;
          hidden.style.position = "fixed";
          hidden.style.left = "-10000px";
          hidden.style.width = "1px";
          hidden.style.height = "1px";
          hidden.srcObject = s;
          document.body.appendChild(hidden);
          await hidden.play().catch((e) => { console.debug("[Startup] hidden video play blocked:", e); });
          preloadedVideoRef.current = hidden;
        } catch (e) {
          console.warn("[Startup] failed creating hidden video for preload:", e);
        }

        streamRef.current = s;
        preloadedStreamRef.current = true;
        console.log("[Startup] camera preloaded");
      } catch (err) {
        console.warn("[Startup] camera preload failed:", err);
      }
    };

    // Try preload immediately on mount (so permission happens early)
    preloadCamera();
    return () => {
      cancelled = true;
      // cleanup hidden video if mount unmounts before using it
      try {
        if (preloadedVideoRef.current) {
          preloadedVideoRef.current.pause();
          if (preloadedVideoRef.current.srcObject) {
            preloadedVideoRef.current.srcObject.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
          }
          preloadedVideoRef.current.remove();
          preloadedVideoRef.current = null;
        }
      } catch (e) {}
    };
  }, []);


  const getCurrentSubjectsInSession = async () => {
    const now = new Date();
    const currentDay = now.toLocaleDateString("en-US", { weekday: "short" });
    const currentTimeStr = now.toTimeString().slice(0, 5);

    const subjectsSnapshot = await getDocs(collection(db, "subjectList"));
    const activeSubjects = [];

    subjectsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (
        data.active !== false &&
        data.days?.includes(currentDay) &&
        data.startTime <= currentTimeStr &&
        currentTimeStr <= data.endTime
      ) {
        activeSubjects.push({ id: docSnap.id, ...data });
      }
    });

    return activeSubjects;
  };

  const logAttendance = async (subjectId, studentId, studentData) => {
    const today = new Date().toISOString().split("T")[0];
    const dayRef = doc(db, "attendance", today);
    const attendanceCol = collection(db, "attendance", today, subjectId);
    const attendanceDocRef = doc(attendanceCol, studentId);

    const existing = await getDoc(attendanceDocRef);
    if (existing.exists()) return false;

    await setDoc(dayRef, { Date: today }, { merge: true });

    const now = new Date();
    const [startHour, startMin] = (studentData._subjectStartTime || "00:00")
      .split(":")
      .map(Number);
    const startTime = new Date();
    startTime.setHours(startHour, startMin + 15, 0, 0);
    const remark = now > startTime ? "Late" : "Present";

    await setDoc(attendanceDocRef, {
      subjectId,
      subjectName: studentData._subjectName || "",
      studentId,
      timestamp: Timestamp.now(),
      name: `${studentData.firstName} ${studentData.lastName}`,
      rfid: studentData.rfid,
      year: studentData.year || studentData.yearLevel || "N/A",
      date: today,
      time: now.toLocaleTimeString(),
      remark,
    });
    return true;
  };

  /** ---------------------- AUDIT LOGGING ---------------------- */
  const logAudit = async ({ subjectCode, studentId, studentData, status, distance }) => {
    try {
      const auditCol = collection(db, "attendanceAudit");
      const auditRef = doc(auditCol); // auto ID
      await setDoc(auditRef, {
        subjectCode: subjectCode || null,
        studentId: studentId || null,
        studentData: studentData || null,
        status,
        distance: typeof distance === "number" ? distance : null,
        timestamp: Timestamp.now(),
      });
    } catch (err) {
      console.error("Failed to write audit log:", err);
    }
  };

  /** ---------------------- RFID HANDLER ---------------------- */
  const handleRFIDDetection = useCallback(
    async (rfidTag) => {
      console.log("[RFID] scanned:", rfidTag);

      // block scans until system is fully ready
      if (!systemReadyRef.current) {
        console.warn("[RFID] Ignored - system not ready yet");
        setError("System initializing — please wait a moment.");
        return;
      }

      if (isScanning || faceModalOpen) {
        console.log("[RFID] ignoring scan - scanner busy or face modal open", { isScanning, faceModalOpen });
        return;
      }

      setIsScanning(true);
      setError(null);
      setSuccess(null);

      if (showStudentCard) {
        setShowStudentCard(null);
        await new Promise(r => setTimeout(r, 200));
      }

      const studentData = allStudents.find(s => s.rfid === rfidTag);
      // improved lookup logging
      console.log("[RFID] lookup result:", studentData ? { id: studentData.id, name: studentData.name || `${studentData.firstName||""} ${studentData.lastName||""}`.trim(), rfid: studentData.rfid } : null);

      // if cached students empty, show helpful debug
      if (!allStudents || allStudents.length === 0) {
        console.warn("[RFID] cache empty: no students cached yet");
      }

      if (!studentData) {
        setError("Student not found in cached data.");
        setIsScanning(false);
        return;
      }

      // ---- filter subjects active right now
      const now = new Date();
      const currentDay = now.toLocaleDateString("en-US", { weekday: "short" });
      const currentTime = now.toTimeString().slice(0, 5);

      const activeSubjects = allSubjects.filter(sub =>
        sub.active !== false &&
        sub.days?.includes(currentDay) &&
        sub.startTime <= currentTime &&
        currentTime <= sub.endTime
      );

      console.log("[RFID] activeSubjects count:", activeSubjects.length, "for time", currentDay, currentTime);
      // show which active subjects include the student
      const availableSubjects = activeSubjects.filter(sub =>
        sub.studentIds?.includes(studentData.id)
      );

      // fixed syntax (removed extra ')') and added mapping log
      console.log("[RFID] subjects matched for student:", availableSubjects.map(s => ({ id: s.id, subject: s.subject || s.name, subjectCode: s.subjectCode })));

      if (availableSubjects.length === 0) {
        setError("Student is not enrolled in a subject for this session.");
        setIsScanning(false);
        return;
      }

      if (availableSubjects.length > 1) {
        setSubjectChoices(availableSubjects);
        subjectRef.current = null; // require user selection
        setPendingStudent(studentData);
        pendingStudentRef.current = studentData; // <-- sync ref
        setSubjectModalOpen(true);
      } else {
        const subject = availableSubjects[0];
        studentData._subjectName = subject.subject;
        studentData._subjectStartTime = subject.startTime;
        setPendingStudent(studentData);
        pendingStudentRef.current = studentData; // <-- sync ref
        setSubjectChoices([subject]);
        subjectRef.current = subject; // <-- set selected subject synchronously
        setFaceModalOpen(true);
        setFaceLastActivity(Date.now());
        await startFaceStream(studentData);
      }

      setIsScanning(false);
    },
    [isScanning, faceModalOpen, showStudentCard, allStudents, allSubjects]
  );

  // RFID keyboard emulation
  useEffect(() => {
    let rfidBuffer = "";
    let timeout = null;

    const handleKeyDown = (e) => {
      if (timeout) clearTimeout(timeout);
      if (faceModalOpen) return;

      // ignore keyboard RFID emulation until system ready
      if (!systemReadyRef.current) return;

      if (/^\d$/.test(e.key)) {
        rfidBuffer += e.key;
      } else if (e.key === "Enter") {
        if (rfidBuffer.length > 0) {
          handleRFIDDetection(rfidBuffer.trim());
          rfidBuffer = "";
        }
      }

      timeout = setTimeout(() => {
        rfidBuffer = "";
      }, 2000);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (timeout) clearTimeout(timeout);
    };
  }, [handleRFIDDetection, faceModalOpen, isScanning]);

  /** ---------------------- FACE HELPERS ---------------------- */
  const drawFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const vw = video.videoWidth || video.width;
    const vh = video.videoHeight || video.height;
    if (!vw || !vh) return;

    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      framesDrawnRef.current++;
    } catch (err) {
      console.debug("[drawFrame] drawImage failed", err);
    }

    // overlay guide oval
    ctx.strokeStyle = "rgba(0, 200, 255, 0.7)";
    ctx.lineWidth = 3;
    const guideW = canvas.width * 0.5;
    const guideH = canvas.height * 0.65;
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, canvas.height / 2, guideW / 2, guideH / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }, []);

  const startRenderLoop = useCallback(() => {
    if (rafRef.current) return;
    const loop = () => {
      drawFrame();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [drawFrame]);

  const stopRenderLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const drawOverlay = (det, dist = null) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");

    ctx.lineWidth = 2;
    ctx.strokeStyle = dist != null && dist < MATCH_THRESHOLD ? "green" : "red";
    const { x, y, width, height } = det.detection.box;
    ctx.strokeRect(x, y, width, height);

    if (dist != null) {
      ctx.fillStyle = "yellow";
      ctx.font = "16px Arial";
      ctx.fillText(dist.toFixed(2), x, y > 20 ? y - 5 : y + 15);
    }
  };

  const loadReferenceDescriptor = async (student) => {
    try {
      if (!student?.faceId) return null;
      const url = await getDownloadURL(ref(storage, student.faceId));
      const img = await faceapi.fetchImage(url);

      let refDet = null;
      if (faceapi.nets.ssdMobilenetv1?.isLoaded) {
        try {
          refDet = await faceapi
            .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (refDet) console.debug("[loadReferenceDescriptor] detected via SSD");
        } catch (e) {
          console.warn("[loadReferenceDescriptor] SSD detection failed", e);
        }
      }

      if (!refDet && faceapi.nets.tinyFaceDetector?.isLoaded) {
        try {
          refDet = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (refDet) console.debug("[loadReferenceDescriptor] detected via Tiny");
        } catch (e) {
          console.warn("[loadReferenceDescriptor] Tiny detection failed", e);
        }
      }

      if (!refDet) {
        console.warn("[loadReferenceDescriptor] no face in reference image");
        setError("Reference face not detected for this student.");
        return null;
      }

      return refDet.descriptor;
    } catch (err) {
      console.error("[loadReferenceDescriptor] error:", err);
      setError("Failed to load reference face.");
      return null;
    }
  };

  /** ---------------------- FACE STREAM ---------------------- */
  const startFaceStream = async (student) => {
    try {
      setCameraLoading(true);
      framesDrawnRef.current = 0;

      // If we already preloaded a stream, reuse it instead of requesting a fresh one.
      // Do NOT call stopFaceStream() here if using the preloaded stream.
      if (streamRef.current && preloadedStreamRef.current) {
        console.debug("[startFaceStream] attaching preloaded stream to video");
        const stream = streamRef.current;
        if (videoRef.current) {
          // attach stream to visible video
          try {
            videoRef.current.srcObject = stream;
            videoRef.current.muted = true;
            videoRef.current.playsInline = true;
            await videoRef.current.play().catch((e) => { console.debug("[startFaceStream] visible video play blocked:", e); });
            startRenderLoop();
          } catch (e) {
            console.warn("[startFaceStream] failed attach/play preloaded stream:", e);
            // fallback: try reattaching after a short delay
            const retryId = setTimeout(async () => {
              try {
                if (videoRef.current) {
                  videoRef.current.srcObject = stream;
                  videoRef.current.muted = true;
                  videoRef.current.playsInline = true;
                  await videoRef.current.play().catch(() => {});
                  startRenderLoop();
                }
              } catch (err) { console.warn("retry attach failed:", err); }
              clearTimeout(retryId);
            }, 300);
          }

          // remove hidden holder now that visible video has the stream
          try {
            if (preloadedVideoRef.current) {
              preloadedVideoRef.current.pause();
              preloadedVideoRef.current.remove();
              preloadedVideoRef.current = null;
            }
          } catch (e) { /* ignore */ }
        } else {
          console.warn("[startFaceStream] videoRef not mounted yet — will attach when available (retrying)");
          // Retry attaching the preloaded stream until the visible video mounts (timeout after 5s)
          const attachId = setInterval(async () => {
            if (!videoRef.current) return;
            try {
              videoRef.current.srcObject = stream;
              videoRef.current.muted = true;
              videoRef.current.playsInline = true;
              await videoRef.current.play().catch(() => {});
              startRenderLoop();
              // remove hidden holder once visible video is active
              if (preloadedVideoRef.current) {
                try { preloadedVideoRef.current.pause(); preloadedVideoRef.current.remove(); } catch (e) {}
                preloadedVideoRef.current = null;
              }
            } catch (e) {
              console.warn("[startFaceStream] retry attach failed:", e);
              return;
            } finally {
              clearInterval(attachId);
            }
          }, 200);
          setTimeout(() => clearInterval(attachId), 5000);
        }
      } else {
        // cleanup any previous streams and request a new one
        stopFaceStream();
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        streamRef.current = stream;
        preloadedStreamRef.current = false; // this is a fresh runtime stream, not the startup preloaded marker

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          try {
            await videoRef.current.play();
          } catch (err) {
            console.warn("[startFaceStream] video.play() failed (autoplay blocked) — continuing", err);
          }
          startRenderLoop();
        } else {
          console.warn("[startFaceStream] videoRef not mounted yet — will retry attach");
          const attachId = setInterval(() => {
            if (videoRef.current) {
              videoRef.current.srcObject = streamRef.current;
              videoRef.current.muted = true;
              videoRef.current.playsInline = true;
              videoRef.current.play().catch(() => {});
              startRenderLoop();
              clearInterval(attachId);
              console.debug("[startFaceStream] attached stream after retry");
            }
          }, 250);
          setTimeout(() => clearInterval(attachId), 5000);
        }
      }

      const descriptor = await loadReferenceDescriptor(student);
      if (descriptor) {
        refDescriptorRef.current = descriptor;
        console.debug("[startFaceStream] reference descriptor loaded");
      } else {
        console.warn("[startFaceStream] reference descriptor not loaded (user can still see camera)");
      }

      setFaceLastActivity(Date.now()); // Reset timer after camera loads
      startVerificationLoop();
    } catch (err) {
      console.error("[startFaceStream] error:", err);
      setError("Unable to access camera: " + (err.message || err));
    } finally {
      setCameraLoading(false);
    }
  };

  const stopFaceStream = useCallback(() => {
    // remove hidden preloaded video if present
    if (preloadedVideoRef.current) {
      try {
        preloadedVideoRef.current.pause();
        if (preloadedVideoRef.current.srcObject) {
          preloadedVideoRef.current.srcObject.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
        }
        preloadedVideoRef.current.remove();
      } catch (e) { console.warn("failed to cleanup preloadedVideo:", e); }
      preloadedVideoRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) {}
      });
      streamRef.current = null;
    }
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }
    stopRenderLoop();
    detectingRef.current = false;
    preloadedStreamRef.current = false; // clear preload marker when stream stopped
  }, [stopRenderLoop]);

  // CENTRALIZED cleanup helper for verification/modal lifecycle
  // stopStream: if true, actually stop media tracks; if false, detach visible video but keep preloaded stream running
  const cleanupVerificationResources = useCallback((opts = { stopStream: false }) => {
    // clear verification interval
    if (loopIntervalRef.current) {
      try { clearInterval(loopIntervalRef.current); } catch (e) {}
      loopIntervalRef.current = null;
    }

    // clear cooldown interval
    if (cdIntervalRef.current) {
      try { clearInterval(cdIntervalRef.current); } catch (e) {}
      cdIntervalRef.current = null;
    }

    // stop rendering to canvas and detach visible video (but keep preloaded stream if requested)
    try { stopRenderLoop(); } catch (e) {}
    detectingRef.current = false;

    try {
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (e) {}
        try { videoRef.current.srcObject = null; } catch (e) {}
      }
    } catch (e) { console.warn("cleanup: detach visible video failed", e); }

    // clear reference descriptor so next scan loads fresh descriptor
    refDescriptorRef.current = null;

    // reset attempt/status UI immediately
    setFaceAttempts(0);
    faceAttemptsRef.current = 0;
    setLastAttemptStatus(null);
    setCameraLoading(false);

    // clear pending selections
    setPendingStudent(null);
    pendingStudentRef.current = null;
    subjectRef.current = null;

    // optionally stop actual media tracks (used for full teardown)
    if (opts.stopStream) {
      try { stopFaceStream(); } catch (e) { console.warn("cleanup: stopFaceStream failed", e); }
    }
  }, [stopFaceStream, stopRenderLoop]);

  useEffect(() => {
    return () => {
      // full teardown on unmount - stop everything
      cleanupVerificationResources({ stopStream: true });
      try { stopFaceStream(); } catch (e) {}
    };
  }, [stopFaceStream]);

  /** ---------------------- VERIFICATION LOOP ---------------------- */
  const startVerificationLoop = useCallback(() => {
    // prevent multiple intervals
    if (loopIntervalRef.current) return;

    faceAttemptsRef.current = 0;
    setFaceAttempts(0);
    setLastAttemptStatus(null);

    loopIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;

      if (cooldown > 0) {
        return;
      }

      if (detectingRef.current) return;
      detectingRef.current = true;

      try {
        const det = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        drawFrame();

        if (det) {
          let dist = null;
          if (refDescriptorRef.current) {
            dist = faceapi.euclideanDistance(refDescriptorRef.current, det.descriptor);
          }

          drawOverlay(det, dist);

          // success
          if (dist != null && dist < MATCH_THRESHOLD) {
            setLastAttemptStatus("success");
            setFaceLastActivity(Date.now()); // Reset timer on success

            await logAudit({
              subjectCode: subjectChoices?.[0]?.subjectCode,
              studentId: pendingStudentRef.current?.id,
              studentData: pendingStudentRef.current,
              status: "success",
              distance: dist,
            });

            // Resolve selected subject robustly (use ref first, fallback to state)
            const subject = subjectRef.current || (subjectChoices && subjectChoices[0]);
            const subjectName = subject?.subject || subject?.name || subject?.subjectCode || null;
            const subjectStart = subject?.startTime || subject?.start || "00:00";

            // ...existing validation...

            // proceed with attendance using safe values
            if (pendingStudentRef.current) {
              const ps = pendingStudentRef.current;
              ps._subjectName = subjectName;
              ps._subjectStartTime = subjectStart;
              const subjectCode = subject?.subjectCode || subjectName;
              const logged = await logAttendance(subjectCode, ps.id, ps);

              console.log("[attendance] attempted", { subjectCode, studentId: ps.id, logged });
              if (logged) {
                setSuccess(`Attendance logged for ${subjectName}`);
                setShowStudentCard({
                  name: `${ps.firstName || ""} ${ps.lastName || ""}`.trim(),
                  year: ps.year || ps.yearLevel || "N/A",
                  subject: subjectName,
                  time: new Date().toLocaleTimeString(),
                });
              } else {
                setError(`Already scanned for ${subjectName} today.`);
              }
            } else {
              setError("Pending student missing.");
              console.error("Pending student missing (ref is null)");
            }

            // clear the visible "success/fail" text immediately so it doesn't linger during close anim
            setLastAttemptStatus(null);
            setFaceAttempts(0);
            faceAttemptsRef.current = 0;

            // animate modal close then cleanup resources (do NOT stop preloaded stream here)
            setFaceClosing(true);
            setTimeout(() => {
              setFaceModalOpen(false);
              setFaceClosing(false);

              // cleanup verification resources but keep preloaded stream alive
              cleanupVerificationResources({ stopStream: false });
            }, 300);
            return;
          } else if (refDescriptorRef.current) {
            // failed attempt
            faceAttemptsRef.current += 1;
            setFaceAttempts(faceAttemptsRef.current);
            setLastAttemptStatus("fail");
            setFaceLastActivity(Date.now()); // Reset timer on fail

            await logAudit({
              subjectCode: subjectChoices?.[0]?.subjectCode,
              studentId: pendingStudentRef.current?.id,
              studentData: pendingStudentRef.current,
              status: "fail",
              distance: dist,
            });

            // cooldown after fail (store interval so it can be cleared on modal close)
            setCooldown(COOLDOWN_SECONDS);
            if (cdIntervalRef.current) {
              clearInterval(cdIntervalRef.current);
              cdIntervalRef.current = null;
            }
            cdIntervalRef.current = setInterval(() => {
              setCooldown((prev) => {
                if (prev <= 1) {
                  if (cdIntervalRef.current) {
                    clearInterval(cdIntervalRef.current);
                    cdIntervalRef.current = null;
                  }
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);

            if (faceAttemptsRef.current >= MAX_ATTEMPTS) {
              // clear verification interval before full failure cleanup
              if (loopIntervalRef.current) {
                clearInterval(loopIntervalRef.current);
                loopIntervalRef.current = null;
              }

              await logAudit({
                subjectCode: subjectChoices?.[0]?.subjectCode,
                studentId: pendingStudentRef.current?.id,
                studentData: pendingStudentRef.current,
                status: "error",
                distance: dist,
              });

              setError("Face verification failed (max attempts).");
              setFaceModalOpen(false);
              stopFaceStream();
              setFaceAttempts(0);
              faceAttemptsRef.current = 0;
              refDescriptorRef.current = null;
              setPendingStudent(null);
              pendingStudentRef.current = null;
              detectingRef.current = false;
              return;
            }
          }
        }
      } catch (err) {
        console.error("[verification loop] error:", err);
        // ensure interval is cleared on unexpected errors
        if (loopIntervalRef.current) {
          clearInterval(loopIntervalRef.current);
          loopIntervalRef.current = null;
        }
        await logAudit({
          subjectCode: subjectChoices?.[0]?.subjectCode,
          studentId: pendingStudentRef.current?.id,
          studentData: pendingStudentRef.current,
          status: "error",
          distance: null,
        });
        setFaceModalOpen(false);
        cleanupVerificationResources({ stopStream: false });
        detectingRef.current = false;
      } finally {
        detectingRef.current = false;
      }
    }, DETECTION_INTERVAL_MS);
  }, [cooldown, drawFrame, subjectChoices, stopFaceStream]);

  /** ---------------------- UI ---------------------- */
  const backdash = () => navigate("/dashboard");

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-gradient-to-b from-gray-200 to-gray-100 relative">
      {/* Header */}
      <header
        className="w-full py-4 shadow-md text-center text-xl font-semibold flex items-center justify-between px-4"
        style={{ backgroundColor: "#0057A4" }}
      >
        <button onClick={backdash} className="flex items-center text-white hover:text-blue-200">
          <ArrowBackIcon className="mr-2" /> Back
        </button>
        <span className="text-white">STI College Vigan</span>
        <div className="w-10" />
      </header>

      {/* Main card */}
      <div className="bg-white rounded-xl shadow-lg w-full max-w-xl mt-16 p-6 flex flex-col items-center">
        <div className="bg-blue-600 text-white w-full py-3 text-center rounded-lg font-semibold text-lg">
          TAP RFID CARD TO TIME IN / TIME OUT
        </div>

        {/* Clock */}
        <div className="text-center my-6">
          <p className="text-4xl font-bold">{currentTime.toLocaleTimeString()}</p>
          <p className="text-gray-600 mt-2 text-lg">
            {currentTime.toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* System message */}
        <div
          className={`w-full py-3 text-center rounded-lg font-medium mb-6 ${
            isScanning
              ? "bg-blue-100 text-blue-700"
              : error
              ? "bg-red-100 text-red-700"
              : success
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {isScanning ? "Scanning..." : error ? error : success ? success : "Waiting for scan..."}
        </div>
      </div>

      {/* Student Card */}
      {showStudentCard && (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 transition-opacity duration-300 ${
            cardClosing ? "opacity-0" : "opacity-100"
          }`}
        >
          <div
            className={`bg-white p-6 rounded-xl shadow-2xl text-center w-96 transform transition-all duration-300 ${
              cardClosing ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{showStudentCard.name}</h2>
            <p className="text-gray-600 mb-1">Year: {showStudentCard.year}</p>
            <p className="text-gray-600 mb-3">Subject: {showStudentCard.subject}</p>
            <p className="text-green-600 font-semibold mb-4">Time in: {showStudentCard.time}</p>
          </div>
        </div>
      )}

      {/* Subject Modal */}
      {subjectModalOpen && (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 transition-opacity duration-300 ${
            subjectClosing ? "opacity-0" : "opacity-100"
          }`}
        >
          <div
            className={`bg-white p-6 rounded-xl shadow-2xl w-96 text-center transform transition-all duration-300 ${
              subjectClosing ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4">Select Subject</h2>
            <div className="flex flex-col space-y-2">
              {subjectChoices.map((subj) => (
                <button
                  key={subj.id}
                  onClick={async () => {
                    const student = { ...(pendingStudentRef.current || pendingStudent) };
                    student._subjectName = subj.subject;
                    student._subjectStartTime = subj.startTime;
                    student._subjectCode = subj.subjectCode;
                    setPendingStudent(student);
                    pendingStudentRef.current = student;
                    setSubjectChoices([subj]);
                    subjectRef.current = subj;
                    setSubjectModalOpen(false);
                    setFaceModalOpen(true);
                    setFaceLastActivity(Date.now());
                    await startFaceStream(student);
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md"
                >
                  {subj.subject || subj.name || subj.id}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Face Verification Modal */}
      {faceModalOpen && (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 ${
            faceClosing ? "opacity-0" : "opacity-100"
          }`}
        >
          <div
            className={`bg-white p-4 sm:p-6 rounded-xl shadow-2xl w-[95%] sm:w-[90%] max-w-md text-center transform transition-all duration-300 ${
              faceClosing ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">Face Verification</h2>

            <div className="relative w-full flex justify-center mb-4">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="rounded-lg shadow-md w-full"
                style={{ maxHeight: "60vh" }}
              />
              <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full rounded-lg pointer-events-none" />
            </div>

            <div className="text-sm text-gray-600 mt-1">
              {cameraLoading ? "Loading camera..." : `Attempts: ${faceAttempts} / ${MAX_ATTEMPTS}`}
            </div>
            {lastAttemptStatus && (
              <div className={`mt-2 font-semibold ${lastAttemptStatus === "success" ? "text-green-600" : "text-red-600"}`}>
                {lastAttemptStatus === "success" ? "✅ Face verified successfully!" : "❌ Face not recognized. Try again."}
              </div>
            )}

            {cooldown > 0 && (
              <div className="mt-1 text-gray-500 text-sm">
                Please wait {cooldown} second{cooldown > 1 ? "s" : ""} before retrying...
              </div>
            )}
          </div>
        </div>
      )}

      {/* cleanup hook moved above return (hooks must be top-level) */}
    </div>
  );
};

export default IDScanner;
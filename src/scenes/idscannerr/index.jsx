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

  const [subjectChoices, setSubjectChoices] = useState([]);
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [pendingStudent, setPendingStudent] = useState(null);

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
  const fetchStudentData = async (rfidTag) => {
    try {
      const q = query(collection(db, "students"), where("rfid", "==", rfidTag));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (err) {
      console.error("Error fetching student data:", err);
      setError("Error fetching student data. Please try again.");
      return null;
    }
  };

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
      if (isScanning || faceModalOpen) return;

      setIsScanning(true);
      setError(null);
      setSuccess(null);

      if (showStudentCard) {
        setShowStudentCard(null);
        await new Promise((r) => setTimeout(r, 200));
      }

      const studentData = await fetchStudentData(rfidTag);
      const subjects = await getCurrentSubjectsInSession();

      if (!studentData) {
        setError("Student not found in database.");
        setIsScanning(false);
        return;
      }

      if (subjects.length > 0) {
        let availableSubjects = [];

        for (const subject of subjects) {
          const studentsCol = collection(db, "subjectList", subject.id, "students");
          const studentDocs = await getDocs(studentsCol);
          const enrolledStudentIds = studentDocs.docs.map((doc) => doc.id);

          if (enrolledStudentIds.includes(studentData.id)) {
            availableSubjects.push(subject);
          }
        }

        if (availableSubjects.length === 0) {
          setError("Student is not enrolled in a subject for this session.");
          setIsScanning(false);
          return;
        }

        if (availableSubjects.length > 1) {
          setSubjectChoices(availableSubjects);
          setPendingStudent(studentData);
          setSubjectModalOpen(true);
        } else {
          studentData._subjectName = availableSubjects[0].subject;
          studentData._subjectStartTime = availableSubjects[0].startTime;
          setPendingStudent(studentData);
          setSubjectChoices([availableSubjects[0]]);
          setFaceModalOpen(true);
          setFaceLastActivity(Date.now()); // Reset timer on open
          await startFaceStream(studentData);
        }
      } else {
        setError("No active subject sessions at this time.");
      }

      setIsScanning(false);
    },
    [isScanning, faceModalOpen, showStudentCard]
  );

  // RFID keyboard emulation
  useEffect(() => {
    let rfidBuffer = "";
    let timeout = null;

    const handleKeyDown = (e) => {
      if (timeout) clearTimeout(timeout);
      if (faceModalOpen) return;

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
      // cleanup any previous streams
      stopFaceStream();

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        try {
          await videoRef.current.play();
          console.debug("[startFaceStream] video.play() succeeded");
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
  }, [stopRenderLoop]);

  useEffect(() => {
    return () => stopFaceStream();
  }, [stopFaceStream]);

  /** ---------------------- VERIFICATION LOOP ---------------------- */
  const startVerificationLoop = useCallback(() => {
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
              studentId: pendingStudent?.id,
              studentData: pendingStudent,
              status: "success",
              distance: dist,
            });

            const subject = subjectChoices[0];
            if (pendingStudent) {
              pendingStudent._subjectName = subject.subject;
              pendingStudent._subjectStartTime = subject.startTime;
              const logged = await logAttendance(subject.subjectCode, pendingStudent.id, pendingStudent);

              if (logged) {
                setSuccess(`Attendance logged for ${subject.subject}`);
                setShowStudentCard({
                  name: `${pendingStudent.firstName || ""} ${pendingStudent.lastName || ""}`.trim(),
                  year: pendingStudent.year || pendingStudent.yearLevel || "N/A",
                  subject: subject.subject,
                  time: new Date().toLocaleTimeString(),
                });
              } else {
                setError(`Already scanned for ${subject.subject} today.`);
              }
            } else {
              setError("Pending student missing.");
            }

            // Apply cooldown after success
            setCooldown(COOLDOWN_SECONDS);
            const cdInterval = setInterval(() => {
              setCooldown((prev) => {
                if (prev <= 1) {
                  clearInterval(cdInterval);
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);

            // cleanup
            setFaceModalOpen(false);
            stopFaceStream();
            setFaceAttempts(0);
            faceAttemptsRef.current = 0;
            refDescriptorRef.current = null;
            setPendingStudent(null);
            return;
          } else if (refDescriptorRef.current) {
            // failed attempt
            faceAttemptsRef.current += 1;
            setFaceAttempts(faceAttemptsRef.current);
            setLastAttemptStatus("fail");
            setFaceLastActivity(Date.now()); // Reset timer on fail

            await logAudit({
              subjectCode: subjectChoices?.[0]?.subjectCode,
              studentId: pendingStudent?.id,
              studentData: pendingStudent,
              status: "fail",
              distance: dist,
            });

            // cooldown after fail
            setCooldown(COOLDOWN_SECONDS);
            const cdInterval = setInterval(() => {
              setCooldown((prev) => {
                if (prev <= 1) {
                  clearInterval(cdInterval);
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);

            if (faceAttemptsRef.current >= MAX_ATTEMPTS) {
              await logAudit({
                subjectCode: subjectChoices?.[0]?.subjectCode,
                studentId: pendingStudent?.id,
                studentData: pendingStudent,
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
              return;
            }
          }
        }
      } catch (err) {
        console.error("[verification loop] error:", err);
        await logAudit({
          subjectCode: subjectChoices?.[0]?.subjectCode,
          studentId: pendingStudent?.id,
          studentData: pendingStudent,
          status: "error",
          distance: null,
        });
      } finally {
        detectingRef.current = false;
      }
    }, DETECTION_INTERVAL_MS);
  }, [cooldown, drawFrame, pendingStudent, subjectChoices, stopFaceStream]);

  /** ---------------------- UI ---------------------- */
  const backdash = () => navigate("/dashboard");

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-gradient-to-b from-gray-200 to-gray-100 relative">
      {/* Header */}
      <header className="w-full py-4 shadow-md text-center text-xl font-semibold flex items-center justify-between px-4" style={{ backgroundColor: "#0057A4" }}>
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
            {currentTime.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* System message */}
        <div className={`w-full py-3 text-center rounded-lg font-medium mb-6 ${
            isScanning ? "bg-blue-100 text-blue-700" : error ? "bg-red-100 text-red-700" : success ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
          }`}>
          {isScanning ? "Scanning..." : error ? error : success ? success : "Waiting for scan..."}
        </div>
      </div>

      {/* Student Card (NO buttons) */}
      {showStudentCard && (
        <div className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 transition-opacity duration-300 ${cardClosing ? "opacity-0" : "opacity-100"}`}>
          <div className={`bg-white p-6 rounded-xl shadow-2xl text-center w-96 transform transition-all duration-300 ${cardClosing ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100"}`}>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{showStudentCard.name}</h2>
            <p className="text-gray-600 mb-1">Year: {showStudentCard.year}</p>
            <p className="text-gray-600 mb-3">Subject: {showStudentCard.subject}</p>
            <p className="text-green-600 font-semibold mb-4">Time in: {showStudentCard.time}</p>
          </div>
        </div>
      )}

      {/* Subject Modal (KEEP subject selection buttons) */}
      {subjectModalOpen && (
        <div className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 transition-opacity duration-300 ${subjectClosing ? "opacity-0" : "opacity-100"}`}>
          <div className={`bg-white p-6 rounded-xl shadow-2xl w-96 text-center transform transition-all duration-300 ${subjectClosing ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100"}`}>
            <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">Select Subject</h2>
            <div className="flex flex-col space-y-2">
              {subjectChoices.map((subj) => (
                <button
                  key={subj.id}
                  onClick={async () => {
                    const student = { ...pendingStudent };
                    student._subjectName = subj.subject;
                    student._subjectStartTime = subj.startTime;
                    student._subjectCode = subj.subjectCode;
                    setSubjectModalOpen(false);
                    setFaceModalOpen(true);
                    setFaceLastActivity(Date.now()); // Reset timer on open
                    await startFaceStream(student);
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md"
                >
                  {subj.subject}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Face Verification Modal (NO Cancel / Retry buttons) */}
      {faceModalOpen && (
        <div className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 ${faceClosing ? "opacity-0" : "opacity-100"}`}>
          <div className={`bg-white p-4 sm:p-6 rounded-xl shadow-2xl w-[95%] sm:w-[90%] max-w-md text-center transform transition-all duration-300 ${faceClosing ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100"}`}>
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">Face Verification</h2>

            <div className="relative w-full flex justify-center">
              <video ref={videoRef} autoPlay muted playsInline className="rounded-lg shadow-md" style={{ width: "100%", maxHeight: "60vh" }} />
              <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full rounded-lg" />
            </div>

            <div className="mt-4 text-gray-600 text-sm">{cameraLoading ? "Loading camera..." : `Attempts: ${faceAttempts} / ${MAX_ATTEMPTS}`}</div>

            {lastAttemptStatus && (
              <div className={`mt-2 font-semibold ${lastAttemptStatus === "success" ? "text-green-600" : "text-red-600"}`}>
                {lastAttemptStatus === "success" ? "✅ Face verified successfully!" : "❌ Face not recognized. Try again."}
              </div>
            )}

            {cooldown > 0 && (
              <div className="mt-1 text-gray-500 text-sm">Please wait {cooldown} second{cooldown > 1 ? "s" : ""} before retrying...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default IDScanner;
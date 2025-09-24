// AddStudent.jsx
import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { db, storage } from "../firebaseConfig";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import * as faceapi from "face-api.js";

const AddStudent = ({
  onClose,
  onAdd,
  initialData,
  subjectID,
  hideCancel = false,
  visible = true,
  validStudentIDs = [],
  role = "unknown",
}) => {
  const [step, setStep] = useState(initialData ? 2 : 1);
  const [studentID, setStudentID] = useState(initialData?.id || "");
  const [formData, setFormData] = useState({
    id: "",
    firstName: "",
    lastName: "",
    contact: "",
    rfid: "",
    guardian: "",
    guardianContact: "",
    year: "",
    faceId: initialData?.faceId || null,
  });
  const [facePreview, setFacePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [capturedImage, setCapturedImage] = useState(null);
  const [faceCount, setFaceCount] = useState(0); // number of detected faces

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionInterval = useRef(null);

  // ---- Load face-api.js models once ----
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "/models"; // ensure /public/models contains weights
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        ]);
      } catch (err) {
        console.error("Error loading face-api.js models:", err);
      }
    };
    loadModels();
  }, []);

  // ---- Populate form if editing ----
  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        firstName:
          initialData.firstName ||
          initialData.name?.split(" ")[0] ||
          "",
        lastName:
          initialData.lastName ||
          initialData.name?.split(" ").slice(1).join(" ") ||
          "",
        year: initialData.year || "",
        faceId: initialData.faceId || null,
      });
    }
  }, [initialData]);

  // ---- Fetch subject year if adding via subject ----
  useEffect(() => {
    const fetchSubjectYear = async () => {
      if (subjectID && !initialData) {
        try {
          const subjectSnap = await getDoc(doc(db, "subjectList", subjectID));
          if (subjectSnap.exists()) {
            const subject = subjectSnap.data();
            setFormData((prev) => ({
              ...prev,
              year: subject.yearLevel || "",
            }));
          }
        } catch (err) {
          console.error("Error fetching subject:", err);
        }
      }
    };
    fetchSubjectYear();
  }, [subjectID, initialData]);

  // ---- Fetch face preview if faceId exists ----
  useEffect(() => {
    const loadFacePreview = async () => {
      if (formData.faceId) {
        try {
          const faceRef = ref(storage, formData.faceId);
          const url = await getDownloadURL(faceRef);
          setFacePreview(url);
        } catch {
          setFacePreview(null);
        }
      } else {
        setFacePreview(null);
      }
    };
    loadFacePreview();
  }, [formData.faceId]);

  const isFormValid = () =>
    formData.firstName &&
    formData.lastName &&
    formData.rfid &&
    formData.year &&
    (initialData ? true : !!formData.faceId);

  // ---- Input change ----
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ---- Student ID check ----
  const handleIDCheck = async () => {
    if (!studentID.trim()) return setError("Student ID is required.");
    const isAdmin = role === "admin";
    const isIDInMasterList = validStudentIDs.includes(studentID.trim());

    if (!isAdmin && subjectID && !isIDInMasterList) {
      return setError("Only existing students in master list can be added.");
    }

    setError("");
    setLoading(true);

    try {
      const studentRef = doc(db, "students", studentID);
      const studentSnap = await getDoc(studentRef);

      if (!initialData && !subjectID && studentSnap.exists()) {
        setError("This ID already exists in the master list.");
        setLoading(false);
        return;
      }

      if (studentSnap.exists()) {
        const data = studentSnap.data();
        if (!initialData && subjectID) {
          const subjRef = doc(db, "subjectList", subjectID, "students", studentID);
          const subjSnap = await getDoc(subjRef);
          if (subjSnap.exists()) {
            setError("Student already enrolled in subject.");
          } else {
            await setDoc(subjRef, { id: studentID });
            onAdd({ id: studentID });
          }
          setLoading(false);
          return;
        }

        setFormData({
          id: studentID,
          ...data,
          firstName: data.firstName || data.name?.split(" ")[0] || "",
          lastName: data.lastName || data.name?.split(" ").slice(1).join(" ") || "",
          year: data.year || formData.year || "",
          faceId: data.faceId || null,
        });
      } else {
        setFormData((prev) => ({ ...prev, id: studentID }));
      }

      setStep(2);
    } catch (err) {
      console.error("Error checking ID:", err);
      setError("Error checking student ID.");
    }
    setLoading(false);
  };

  // ---- Submit form ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const studentRef = doc(db, "students", formData.id);
      if (!initialData) {
        const exists = await getDoc(studentRef);
        if (exists.exists()) return setError("ID already exists in master list.");
      }

      const snap = await getDocs(collection(db, "students"));
      const rfidExists = snap.docs.some(
        (doc) => doc.data().rfid === formData.rfid && doc.id !== formData.id
      );
      if (rfidExists) return setError("RFID already used by another student.");

      await setDoc(studentRef, formData, { merge: true });

      if (!initialData && subjectID) {
        const subjectRef = doc(db, "subjectList", subjectID, "students", formData.id);
        const link = await getDoc(subjectRef);
        if (!link.exists()) await setDoc(subjectRef, { id: formData.id });
      }

      onAdd(formData);
    } catch (err) {
      console.error("Error submitting form:", err);
      setError("Failed to submit student data.");
    }
  };

  // ---- Camera functions ----
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError("Unable to access camera.");
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (detectionInterval.current) {
      clearInterval(detectionInterval.current);
      detectionInterval.current = null;
    }
  };

  // ---- Capture photo ----
  const handleCapture = () => {
    if (faceCount !== 1) {
      setError("Please ensure exactly one face is visible.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, 320, 240);
    setCapturedImage(canvas.toDataURL("image/png"));
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setFaceCount(0);
    startCamera();
  };

  const handleSaveCapture = async () => {
    if (!capturedImage) return;
    try {
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      const faceRef = ref(storage, `faces/${formData.id}/face.png`);
      await uploadBytes(faceRef, blob);
      const url = await getDownloadURL(faceRef);

      setFormData((prev) => ({
        ...prev,
        faceId: `faces/${formData.id}/face.png`,
      }));
      setFacePreview(url);

      setStep(2);
    } catch (err) {
      console.error("Face upload error:", err);
      setError("Failed to upload face image.");
    }
  };

  // ---- Face detection ----
  const handleVideoPlay = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    canvas.width = video.width;
    canvas.height = video.height;

    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    detectionInterval.current = setInterval(async () => {
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions()
      );
      const resized = faceapi.resizeResults(detections, displaySize);

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      faceapi.draw.drawDetections(canvas, resized);

      setFaceCount(resized.length);
    }, 200);
  };

  if (!visible) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex justify-center items-center px-4">
      <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {initialData
            ? "Edit Student"
            : step === 1
            ? "Enter Student ID"
            : step === 2
            ? "Student Details"
            : "Face Capture"}
        </h2>

        {/* Step 1: ID Input */}
        {step === 1 && (
          <div className="space-y-4">
            <input
              name="studentID"
              placeholder="Student ID"
              value={studentID}
              onChange={(e) => setStudentID(e.target.value)}
              className="w-full border px-3 py-2 rounded"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              {!hideCancel && (
                <button
                  onClick={onClose}
                  className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleIDCheck}
                className="bg-blue-700 text-white px-6 py-2 rounded hover:bg-blue-800"
              >
                {loading ? "Checking..." : "Next"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Form */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              name="id"
              value={formData.id}
              disabled
              className="w-full border px-3 py-2 rounded bg-gray-100"
            />
            {["firstName", "lastName", "contact", "rfid", "guardian", "guardianContact"].map(
              (field) => (
                <input
                  key={field}
                  name={field}
                  placeholder={field
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (s) => s.toUpperCase())}
                  value={formData[field]}
                  onChange={handleChange}
                  className="w-full border px-3 py-2 rounded"
                />
              )
            )}
            <select
              name="year"
              value={formData.year}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded"
            >
              <option value="">Select Year Level</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
              <option value="3rd Year">3rd Year</option>
              <option value="4th Year">4th Year</option>
            </select>

            {facePreview && (
              <div className="text-center space-y-2">
                <img
                  src={facePreview}
                  alt="Current face"
                  className="w-24 h-24 rounded-full object-cover mx-auto border"
                />
                <p className="text-sm text-gray-600">Current Face</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setStep(3);
                startCamera();
              }}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 w-full"
            >
              {facePreview ? "Update Face" : "Capture Face"}
            </button>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              {!hideCancel && (
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={!isFormValid()}
                className={`px-6 py-2 rounded font-medium ${
                  isFormValid()
                    ? "bg-blue-700 text-white hover:bg-blue-800"
                    : "bg-gray-300 text-gray-600 cursor-not-allowed"
                }`}
              >
                {initialData ? "Update" : "Add Student"}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Face Capture */}
        {step === 3 && (
          <div className="space-y-4 text-center">
            <h3 className="text-lg font-semibold mb-2">Capture Student Face</h3>
            {!capturedImage ? (
              <div className="relative inline-block w-[320px] h-[240px]">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  width="320"
                  height="240"
                  className="border rounded w-full h-full"
                  onPlay={handleVideoPlay}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                />
              </div>
            ) : (
              <img
                src={capturedImage}
                alt="Captured"
                className="w-48 h-48 object-cover rounded-full mx-auto border"
              />
            )}

            <div className="flex justify-center gap-3 mt-4">
              {!capturedImage ? (
                <button
                  onClick={handleCapture}
                  disabled={faceCount !== 1}
                  className={`px-4 py-2 rounded text-white ${
                    faceCount === 1
                      ? "bg-blue-700 hover:bg-blue-800"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                >
                  {faceCount === 1
                    ? "Capture"
                    : faceCount === 0
                    ? "No Face Detected"
                    : "Multiple Faces Detected"}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleRetake}
                    className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
                  >
                    Retake
                  </button>
                  <button
                    onClick={handleSaveCapture}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    Save
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setCapturedImage(null);
                  stopCamera();
                  setStep(2);
                }}
                className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default AddStudent;

import React, { useEffect, useState, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc as firestoreDoc,
  getDoc,
} from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { createPortal } from "react-dom";

const Admin = () => {
  const navigate = useNavigate();
  const { user, displayName: ctxDisplayName, role: ctxRole } = useAuth();

  // camera modal state (separate from Set Profile Picture modal)
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // unified success modal state (title/message configurable)
  const [successModal, setSuccessModal] = useState({
    visible: false,
    title: "",
    message: "",
  });
 // debug helper
 const dbg = (...args) => console.debug("[AdminProfile]", ...args);
 
  const [loading, setLoading] = useState(true);
  const [docId, setDocId] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [photoURL, setPhotoURL] = useState("");

  // photo upload
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // camera capture refs/state
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);

  // modal state for Set Profile Picture
  const [showSetPicModal, setShowSetPicModal] = useState(false);
  const [modalError, setModalError] = useState(null);

  // start camera stream (used by camera modal)
  const startCamera = async () => {
    setModalError(null);
    dbg("startCamera() called");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      dbg("got media stream", stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // ensure playsInline / muted so autoplay works on mobile
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        // attempt play (some browsers require user interaction)
        try {
          await videoRef.current.play();
          dbg("video play started");
        } catch (playErr) {
          dbg("video.play() rejected:", playErr);
        }
      }
      setMediaStream(stream);
      setCameraActive(true);
    } catch (err) {
      console.error("Camera start failed:", err);
      setModalError("Cannot access camera. Make sure permission is granted and a camera is available.");
      setCameraActive(false);
    }
  };

  // open camera modal and start camera
  const openCameraModal = async () => {
    dbg("openCameraModal()");
    setShowCameraModal(true);
    // small delay to ensure modal/video element mounted
    setTimeout(() => startCamera(), 200);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        // Prefer instructor doc matched by uid; fallback to using user fields
        if (user?.uid) {
          const q = query(collection(db, "instructors"), where("uid", "==", user.uid));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            const data = d.data() || {};
            setDocId(d.id);
            setName((data.name && String(data.name).trim()) || ctxDisplayName || user.displayName || "");
            setEmail((data.email && String(data.email).trim()) || user.email || "");
            setPosition((data.role && String(data.role).trim()) || ctxRole || "");
            setPhotoURL(data.photoURL || "");
            setLoading(false);
            return;
          }
        }

        // fallback: try to read instructor doc by possible id in user (instructorCode)
        if (user?.instructorCode) {
          const snap = await getDoc(firestoreDoc(db, "instructors", user.instructorCode));
          if (snap.exists()) {
            const data = snap.data() || {};
            setDocId(snap.id);
            setName(data.name || ctxDisplayName || user.displayName || "");
            setEmail(data.email || user.email || "");
            setPosition(data.role || ctxRole || "");
            setPhotoURL(data.photoURL || "");
            setLoading(false);
            return;
          }
        }

        // no doc found: use auth info
        setName(ctxDisplayName || user?.displayName || "");
        setEmail(user?.email || "");
        setPosition(ctxRole || "");
        setPhotoURL("");
      } catch (err) {
        console.error("Failed to load admin profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ctxDisplayName, ctxRole]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const onCameraPick = async () => {
    // open separate camera modal which activates camera
    await openCameraModal();
  };

  // open file picker (select file from storage)
  const onFilePick = () => {
    setModalError(null);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const stopCamera = () => {
    dbg("stopCamera()");
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => {
        dbg("stopping track", t);
        try {
          t.stop();
        } catch (e) {
          dbg("error stopping track", e);
        }
      });
      setMediaStream(null);
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (e) {
        dbg("error clearing video src", e);
      }
    }
    setCameraActive(false);
    // also close camera modal if open
    setShowCameraModal(false);
  };

  // revoke preview URL when component unmounts or preview changes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // create a circular-cropped File from an image File (center-crop square -> circle visually)
  const makeCircularFile = (file) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        // draw center-cropped square
        ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
        // optional: apply circle mask for preview (visual) - the upload will be a square image
        // export blob
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Canvas blob failed"));
            const circularFile = new File([blob], file.name, { type: blob.type });
            resolve(circularFile);
          },
          "image/jpeg",
          0.9
        );
      };
      img.onerror = (e) => reject(e);
      // load from object URL
      const url = URL.createObjectURL(file);
      img.src = url;
    });

  const capturePhoto = () => {
    dbg("capturePhoto()");
    if (!videoRef.current) {
      setModalError("No video stream available.");
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setModalError("Capture failed.");
        dbg("canvas.toBlob returned null");
        return;
      }
      const rawFile = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
      dbg("captured raw file", rawFile);
      try {
        const circular = await makeCircularFile(rawFile);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const obj = URL.createObjectURL(circular);
        setPreviewUrl(obj);
        setSelectedFile(circular);
      } catch (err) {
        dbg("makeCircularFile on capture failed", err);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const obj = URL.createObjectURL(rawFile);
        setPreviewUrl(obj);
        setSelectedFile(rawFile);
      }
      stopCamera();
      setShowSetPicModal(true);
    }, "image/jpeg", 0.95);
  };

  const handleFileChange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      dbg("file selected", f.name, f.size, f.type);
      try {
        const circular = await makeCircularFile(f);
        // revoke previous preview
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const obj = URL.createObjectURL(circular);
        setPreviewUrl(obj);
        setSelectedFile(circular);
      } catch (err) {
        dbg("makeCircularFile failed", err);
        // fallback to raw file preview
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const obj = URL.createObjectURL(f);
        setPreviewUrl(obj);
        setSelectedFile(f);
      }
    }
  };

  const handleSavePhoto = async () => {
    if (!selectedFile) return alert("No file selected.");
    if (!user?.uid && !docId) return alert("User not identified to save photo.");

    setUploading(true);
    setModalError(null);
    try {
      const storage = getStorage();
      const path = `profilePictures/${user?.uid || docId}/${Date.now()}_${selectedFile.name}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, selectedFile);
      const url = await getDownloadURL(sRef);

      if (docId) {
        await updateDoc(firestoreDoc(db, "instructors", docId), { photoURL: url });
      } else if (user?.uid) {
        // try to find doc again by uid and update
        const q = query(collection(db, "instructors"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          await updateDoc(firestoreDoc(db, "instructors", d.id), { photoURL: url });
          setDocId(d.id);
        } else {
          console.warn("No instructor document found to update photoURL.");
        }
      }

      setPhotoURL(url);
      setSelectedFile(null);
      setShowSetPicModal(false);
      // show success confirm dialog instead of alert
      setSuccessModal({
        visible: true,
        title: "Profile Picture Set",
        message: "Profile Picture Successfully added",
      });
    } catch (err) {
      console.error("Failed to upload photo:", err);
      setModalError("Failed to upload. See console for details.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!docId && !user?.uid) {
      setModalError("User not identified to delete photo.");
      setShowDeleteConfirm(false);
      return;
    }
    setUploading(true);
    try {
      if (docId) {
        await updateDoc(firestoreDoc(db, "instructors", docId), { photoURL: "" });
      } else {
        const q = query(collection(db, "instructors"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          await updateDoc(firestoreDoc(db, "instructors", d.id), { photoURL: "" });
          setDocId(d.id);
        } else {
          console.warn("No instructor document found to delete photoURL.");
        }
      }
      setPhotoURL("");
      setSelectedFile(null);
      setShowDeleteConfirm(false);
      setShowSetPicModal(false);
      // show deletion success modal with requested title/message
      setSuccessModal({
        visible: true,
        title: "Deletion Successful",
        message: "Profile picture deleted successfully",
      });
    } catch (err) {
      console.error("Failed to delete photo:", err);
      setModalError("Failed to delete. See console for details.");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    // cleanup media stream on unmount
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (e) {
            dbg("error stopping track on unmount", e);
          }
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaStream]);

  // ensure camera also stops when SetPic modal closes
  useEffect(() => {
    if (!showSetPicModal) {
      // if camera modal is still open, keep it; otherwise make sure camera inactive
      if (!showCameraModal) stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSetPicModal]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#333] font-sans">
      {/* Header */}
      <div className="bg-[#005BAC] text-white px-10 py-16 w-full relative">
        {/* Back Button */}
        <button
          onClick={() => navigate("/dashboard")}
          className="absolute top-6 left-6 flex items-center text-white hover:text-gray-200 transition text-lg"
        >
          <ArrowLeft className="w-6 h-6 mr-2" />
          Back
        </button>

        <div className="flex items-center mt-10 ml-14">
          <div className="w-24 h-24 bg-gray-300 rounded-full border-4 border-white overflow-hidden">
            {photoURL ? (
              <img src={photoURL} alt="profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-gray-600">
                No photo
              </div>
            )}
          </div>

          <div className="ml-6">
            <h2 className="text-4xl font-bold">{name || "User"}</h2>
            <p className="text-lg">{/* campus removed per request */}</p>
          </div>

          <div className="ml-auto">
            <button
              onClick={() => setShowSetPicModal(true)}
              className="bg-white text-[#005BAC] hover:bg-gray-100 text-lg px-6 py-2 rounded shadow-sm transition"
            >
              Set Profile Picture
            </button>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="px-8 py-8">
        <h3 className="text-2xl text-[#005BAC] font-bold mb-4">Info</h3>
        <div className="text-lg space-y-2 text-[#444] max-w-2xl">
          <p><span className="font-semibold">Position:</span> {position}</p>
          <p><span className="font-semibold">Email:</span> {email}</p>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={handleLogout}
            className="bg-[#D32F2F] hover:bg-red-700 text-white px-6 py-3 text-lg rounded shadow-sm transition"
          >
            Log out
          </button>
        </div>

        {/* hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Set Profile Picture Modal */}
        {showSetPicModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            {/* expand modal horizontally when both an existing photo and a newly selected one exist */}
            <div
              className={`bg-white rounded-lg w-full p-6 shadow-lg ${
                selectedFile && photoURL ? "max-w-3xl" : "max-w-lg"
              }`}
            >
              <h3 className="text-xl font-semibold mb-4">Set Profile Picture</h3>

              <div className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-1/2 flex items-center justify-center border rounded p-3">
                  {/* circular preview - use previewUrl when available (cropped), else existing photoURL */}
                  {previewUrl || photoURL ? (
                    <div className="w-40 h-40 rounded-full overflow-hidden border">
                      <img
                        src={previewUrl || photoURL}
                        alt="preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-40 h-40 rounded-full bg-gray-100 flex items-center justify-center text-sm text-gray-500">
                      No photo
                    </div>
                  )}
                </div>

                <div className="w-full md:w-1/2 space-y-3">
                  <p className="text-sm text-gray-700">
                    Choose an option to provide a new profile picture.
                  </p>

                  <div className={`flex flex-wrap gap-2`}>
                    <button
                      onClick={openCameraModal}
                      className="px-3 py-2 bg-white border rounded text-[#005BAC]"
                    >
                      Take Photo
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 bg-gray-100 border rounded text-gray-800"
                    >
                      Select File
                    </button>
                    {photoURL && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-3 py-2 bg-red-100 border rounded text-red-700"
                      >
                        Delete Profile Picture
                      </button>
                    )}
                    {selectedFile && (
                      <button
                        onClick={() => {
                          dbg("remove selected file");
                          // remove selected + preview
                          setSelectedFile(null);
                          if (previewUrl) {
                            URL.revokeObjectURL(previewUrl);
                            setPreviewUrl(null);
                          }
                        }}
                        className="px-3 py-2 bg-gray-200 border rounded text-gray-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <canvas ref={canvasRef} className="hidden" />

                  {modalError && <div className="text-sm text-red-600">{modalError}</div>}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    // stop camera if active and close modal
                    stopCamera();
                    setShowSetPicModal(false);
                    setSelectedFile(null);
                    setModalError(null);
                  }}
                  className="px-4 py-2 bg-gray-200 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await handleSavePhoto();
                  }}
                  disabled={!selectedFile || uploading}
                  className={`px-4 py-2 rounded text-white ${!selectedFile || uploading ? "bg-gray-300" : "bg-green-600"}`}
                >
                  {uploading ? "Saving..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Camera Modal - separate from Set Profile Picture modal */}
        {showCameraModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg w-full max-w-3xl p-6 shadow-lg">
              <h3 className="text-xl font-semibold mb-4">Camera</h3>

              {modalError && <div className="text-sm text-red-600 mb-4">{modalError}</div>}

              <div className="flex flex-col items-center">
                <div className="w-full flex justify-center mb-4">
                  {/* video element for camera stream */}
                  <video
                    ref={videoRef}
                    className="w-full max-w-md rounded-lg border"
                    autoPlay
                    playsInline
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={capturePhoto}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow-sm transition"
                  >
                    Capture
                  </button>
                  <button
                    onClick={stopCamera}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded shadow-sm transition"
                  >
                    Stop
                  </button>
                </div>
              </div>

              {/* Close button removed - Stop/capture handle actions */}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to delete your profile picture? This action cannot be undone.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-gray-200 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePhoto}
                  disabled={uploading}
                  className={`px-4 py-2 rounded text-white ${uploading ? "bg-gray-300" : "bg-red-600"}`}
                >
                  {uploading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal (for profile picture set/deletion confirmation) */}
        {successModal.visible && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-4">{successModal.title}</h3>
              <p className="text-sm text-gray-700 mb-4">{successModal.message}</p>

              <div className="flex justify-end">
                <button
                  onClick={() => setSuccessModal({ ...successModal, visible: false })}
                  className="px-4 py-2 bg-[#005BAC] text-white rounded"
                >
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};

export default Admin;

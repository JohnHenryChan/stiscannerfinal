import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseConfig"; // Import initialized functions

const AddInstructor = ({ onClose, onAdd, initialData, visible = true }) => {
  const isEdit = Boolean(initialData);

  const [formData, setFormData] = useState(() =>
    initialData ? {
      id: initialData.id || "",
      name: initialData.name || "",
      email: initialData.email || "",
    } : { id: "", name: "", email: "" }
  );
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [instructorID, setInstructorID] = useState(() => initialData?.id || "");
  const [error, setError] = useState("");



  useEffect(() => {
    if (!visible) {
      setFormData({ id: "", name: "", email: "" });
      setInstructorID("");
      setStep(isEdit ? 2 : 1);
      setError("");
    } else if (initialData) {
      setFormData({
        id: initialData.id || "",
        name: initialData.name || "",
        email: initialData.email || "",
      });
      setInstructorID(initialData.id || "");
      setStep(2);
      setError("");
    }
  }, [visible, initialData, isEdit]);

  if (!visible) return null;

  const handleIDCheck = async () => {
    if (step !== 1) return; // ⛔ prevent firing again post-step 2
    if (!instructorID.trim()) {
      setError("Please enter an Instructor ID");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const ref = doc(db, "instructors", instructorID.trim());
      const snap = await getDoc(ref);

      const isSameID = initialData?.id === instructorID.trim();

      if (snap.exists() && !isEdit && !isSameID) {
        setError("Instructor ID already exists.");
        return;
      }

      setFormData((prev) => ({
        ...prev,
        id: instructorID.trim(),
      }));

      setStep(2);
    } catch (err) {
      console.error("🔍 Error checking ID:", err);
      setError("Failed to validate Instructor ID.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const isFormValid = () => {
    const { id, name, email } = formData;
    return id && name && email && email.includes("@");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const { email, id, name } = formData;

    if (!email || !id || !name) {
      setError("All fields are required.");
      return;
    }

    try {
      const createInstructorUser = httpsCallable(functions, "createInstructorUser");
      const result = await createInstructorUser({ email, name });
      const uid = result.data.uid;

      const instructorData = {
        id,
        name,
        email,
        uid,
        role: "user",
        mustChangePassword: true,
      };

      await setDoc(doc(db, "instructors", id), instructorData);
      onAdd(instructorData);
      onClose();
    } catch (err) {
      console.error("🔥 Error creating instructor:", err);
      setError(err.message || "Unknown error occurred.");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-6 animate-fade-in">
        <h2 className="text-lg font-semibold mb-4">
          {isEdit ? "Edit Instructor" : step === 1 ? "Enter Instructor ID" : "Instructor Details"}
        </h2>

        {!isEdit && step === 1 ? (
          <div className="space-y-4">
            <input
              name="instructorID"
              placeholder="Instructor ID"
              value={instructorID}
              onChange={(e) => setInstructorID(e.target.value)}
              className="w-full border px-3 py-2 rounded"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleIDCheck}
                className="bg-blue text-white px-6 py-2 rounded hover:bg-blue-700"
              >
                {loading ? "Checking..." : "Next"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              name="id"
              value={formData.id}
              disabled
              className="w-full border px-3 py-2 rounded bg-gray-100 cursor-not-allowed"
            />
            <input
              name="name"
              placeholder="Instructor Name"
              value={formData.name}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded"
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isFormValid()}
                className={`px-6 py-2 rounded text-white ${isFormValid()
                  ? "bg-blue hover:bg-blue"
                  : "bg-gray-300 cursor-not-allowed"
                  }`}
              >
                {isEdit ? "Update" : "Add Instructor"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AddInstructor;

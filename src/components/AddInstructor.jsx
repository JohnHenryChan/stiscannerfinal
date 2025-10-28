import React, { useState, useEffect } from "react";
import { db, functions } from "../firebaseConfig";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const AddInstructor = ({ onClose, onAdd, initialData, visible = true }) => {
  const isEdit = Boolean(initialData);

  // --- State ---
  const [formData, setFormData] = useState({
    id: initialData?.id || "",
    name: initialData?.name || "",
    email: initialData?.email || "",
    role: initialData?.role || "instructor",
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [instructorID, setInstructorID] = useState(initialData?.id || "");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");

  // --- Reset state when modal closes/opens ---
  useEffect(() => {
    if (!visible) {
      setFormData({
        id: initialData?.id || "",
        name: initialData?.name || "",
        email: initialData?.email || "",
        role: initialData?.role || "instructor",
      });
      setInstructorID(initialData?.id || "");
      setStep(isEdit ? 2 : 1);
      setError("");
      setEmailError("");
    }
  }, [visible, isEdit, initialData]);

  if (!visible) return null;

  // --- Validation: Instructor ID must be exactly 11 digits ---
  const validateInstructorID = (id) => {
    const trimmed = id.trim();
    if (trimmed.length !== 11) {
      return "Instructor ID must be exactly 11 digits.";
    }
    if (!/^\d{11}$/.test(trimmed)) {
      return "Instructor ID must contain only numbers.";
    }
    return null;
  };

  // --- Validation: Email format <string>@vigan.sti.edu.ph (no duplicate @, valid format) ---
  const validateEmail = (email) => {
    const trimmed = email.trim();
    if (!trimmed.endsWith("@vigan.sti.edu.ph")) {
      return "Email must be in format: <username>@vigan.sti.edu.ph";
    }
    const username = trimmed.replace("@vigan.sti.edu.ph", "");
    if (!username || username.includes("@")) {
      return "Email format is invalid. Use: <username>@vigan.sti.edu.ph";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return "Invalid email format.";
    }
    return null;
  };

  // --- Step 1: Check Instructor ID ---
  const handleIDCheck = async () => {
    const trimmedID = instructorID.trim();
    
    const idError = validateInstructorID(trimmedID);
    if (idError) {
      setError(idError);
      return;
    }

    setError("");
    setLoading(true);

    try {
      const ref = doc(db, "instructors", trimmedID);
      const snap = await getDoc(ref);

      const isSameID = initialData?.id === trimmedID;

      if (snap.exists() && !isEdit && !isSameID) {
        setError("Instructor ID already exists.");
        return;
      }

      setFormData((prev) => ({ ...prev, id: trimmedID }));
      setStep(2);
    } catch (err) {
      console.error("🔍 Error checking ID:", err);
      setError("Failed to validate Instructor ID.");
    } finally {
      setLoading(false);
    }
  };

  // --- Step 2: Form change handler ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === "instructorID") {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 11);
      setInstructorID(digitsOnly);
      return;
    }

    // Real-time email validation
    if (name === "email") {
      const emailValidationError = validateEmail(value);
      setEmailError(emailValidationError || "");
    }
    
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const isFormValid = () => {
    const { id, name, email } = formData;
    if (!id || !name || !email) return false;
    if (validateEmail(email)) return false;
    return true;
  };

  // --- Check for duplicate email (excluding current user in edit mode) ---
  const checkDuplicateEmail = async (email) => {
    try {
      const instructorsSnap = await getDocs(collection(db, "instructors"));
      const duplicate = instructorsSnap.docs.find((d) => {
        const data = d.data();
        if (isEdit && d.id === formData.id) return false;
        return data.email?.toLowerCase() === email.toLowerCase();
      });
      return duplicate ? true : false;
    } catch (err) {
      console.error("Error checking duplicate email:", err);
      return false;
    }
  };

  // --- Submit ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const { email, id, name, role } = formData;

    if (!email || !id || !name) {
      setError("All fields are required.");
      return;
    }

    const emailValidationError = validateEmail(email);
    if (emailValidationError) {
      setError(emailValidationError);
      return;
    }

    const isDuplicate = await checkDuplicateEmail(email);
    if (isDuplicate) {
      setError("Email already exists. Please use a different email.");
      return;
    }

    setLoading(true);

    try {
      if (isEdit) {
        await updateDoc(doc(db, "instructors", id), {
          name,
          email,
          role,
        });
      } else {
        const createInstructorUser = httpsCallable(functions, "createInstructorUser");
        const result = await createInstructorUser({ email, name });
        const uid = result.data.uid;

        const instructorData = {
          id,
          name,
          email,
          uid,
          role,
          mustChangePassword: true,
        };

        await setDoc(doc(db, "instructors", id), instructorData);
      }

      onAdd(formData);
      onClose();
    } catch (err) {
      console.error("🔥 Error saving instructor:", err);
      setError(err.message || "Unknown error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-6 animate-fade-in">
        <h2 className="text-lg font-semibold mb-4">
          {isEdit
            ? "Edit User"
            : step === 1
            ? "Enter User ID"
            : "User Details"}
        </h2>

        {/* --- Step 1: Enter Instructor ID --- */}
        {!isEdit && step === 1 ? (
          <div className="space-y-4">
            <input
              name="instructorID"
              placeholder="User ID (11 digits)"
              value={instructorID}
              onChange={handleChange}
              maxLength={11}
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
                disabled={loading}
                className="bg-blue-700 text-white px-6 py-2 rounded hover:bg-blue-800 disabled:bg-gray-300"
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
              placeholder="Name"
              value={formData.name}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded"
            />
            
            {/* Email input with tooltip icon */}
            <div className="relative">
              <input
                name="email"
                type="email"
                placeholder="Email (e.g., username@vigan.sti.edu.ph)"
                value={formData.email}
                onChange={handleChange}
                className={`w-full border px-3 py-2 rounded ${
                  emailError ? "border-red-500" : ""
                }`}
              />
              {emailError && formData.email && (
                <div className="absolute right-2 top-2">
                  <div className="relative inline-flex group">
                    <span className="text-red-500 cursor-help">❗</span>
                    <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 w-64 p-2 bg-white rounded-md shadow-lg border border-gray-200">
                      <div className="text-red-600 font-medium mb-1">Invalid Email Format</div>
                      <div className="text-sm text-gray-700">{emailError}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded"
            >
              <option value="instructor">Instructor</option>
              <option value="admin">Admin</option>
              <option value="guidance">Guidance Counselor</option>
              <option value="registrar">Registrar</option>
            </select>

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
                disabled={!isFormValid() || loading}
                className={`px-6 py-2 rounded text-white ${
                  isFormValid() && !loading
                    ? "bg-blue-700 hover:bg-blue-800"
                    : "bg-gray-300 cursor-not-allowed"
                }`}
              >
                {loading ? "Saving..." : isEdit ? "Update" : "Add User"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AddInstructor;

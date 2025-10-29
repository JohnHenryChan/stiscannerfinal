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
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [changedFields, setChangedFields] = useState([]);

  // --- Reset state when modal closes/opens ---
  useEffect(() => {
    if (!visible) {
      setFormData({
        id: initialData?.id || "",
        name: initialData?.name || "",
        email: initialData?.email || "",
        role: initialData?.role || "instructor",
      });
      setError("");
      setEmailError("");
      setShowConfirm(false);
      setChangedFields([]);
    }
  }, [visible, initialData]);

  if (!visible) return null;

  // --- Validation: Instructor ID must be exactly 11 digits ---
  const validateInstructorID = (id) => {
    const trimmed = (id || "").trim();
    if (trimmed.length !== 11) return "Instructor ID must be exactly 11 digits.";
    if (!/^\d{11}$/.test(trimmed)) return "Instructor ID must contain only numbers.";
    return null;
  };

  // --- Validation: Email format <string>@vigan.sti.edu.ph ---
  const validateEmail = (email) => {
    const trimmed = (email || "").trim();
    if (!trimmed.endsWith("@vigan.sti.edu.ph")) {
      return "Email must be in format: <username>@vigan.sti.edu.ph";
    }
    const username = trimmed.replace("@vigan.sti.edu.ph", "");
    if (!username || username.includes("@")) {
      return "Email format is invalid. Use: <username>@vigan.sti.edu.ph";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) return "Invalid email format.";
    return null;
  };

  // --- Change handler ---
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "id" && !isEdit) {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 11);
      setFormData((prev) => ({ ...prev, id: digitsOnly }));
      return;
    }

    if (name === "email" && !isEdit) {
      const emailValidationError = validateEmail(value);
      setEmailError(emailValidationError || "");
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const isFormValid = () => {
    const { id, name, email } = formData;
    if (!name) return false;
    if (!isEdit) {
      if (!id || validateInstructorID(id)) return false;
      if (!email || validateEmail(email)) return false;
    }
    return true;
  };

  // --- Check for duplicate email (excluding current user in edit mode) ---
  const checkDuplicateEmail = async (email) => {
    try {
      const snap = await getDocs(collection(db, "instructors"));
      const duplicate = snap.docs.find((d) => {
        const data = d.data();
        if (isEdit && d.id === formData.id) return false;
        return data.email?.toLowerCase() === (email || "").toLowerCase();
      });
      return !!duplicate;
    } catch {
      return false;
    }
  };

  // Clear subjectList when role changes from instructor to something else
  const handleRoleChange = async (instructorData, newRole) => {
    const currentRole = instructorData.role || "instructor";
    const instructorId = instructorData.id;
    
    console.log(`[RoleChange] User ${instructorId} role changing from '${currentRole}' to '${newRole}'`);
    
    // If changing FROM instructor TO something else, clear their subjectList
    if (currentRole === "instructor" && newRole !== "instructor") {
      console.log(`[RoleChange] Clearing subjectList for ${instructorId} (${instructorData.name}) - no longer instructor`);
      
      try {
        // Get current instructor document to check existing subjectList
        const instructorRef = doc(db, "instructors", instructorId);
        const instructorDoc = await getDoc(instructorRef);
        
        if (instructorDoc.exists()) {
          const currentData = instructorDoc.data();
          const currentSubjectList = currentData.subjectList || [];
          
          console.log(`[RoleChange] Current subjectList for ${instructorId}:`, currentSubjectList);
          
          if (currentSubjectList.length > 0) {
            // Clear subjectList and update role
            await updateDoc(instructorRef, {
              role: newRole,
              subjectList: [], // Clear the array
              lastRoleChange: new Date(),
              previousRole: currentRole
            });
            
            console.log(`✅ [RoleChange] Cleared subjectList for ${instructorId} - removed ${currentSubjectList.length} subjects`);
            
            // Optional: Also remove instructor assignment from affected subjects
            for (const subjectId of currentSubjectList) {
              try {
                const subjectRef = doc(db, "subjectList", subjectId);
                const subjectDoc = await getDoc(subjectRef);
                
                if (subjectDoc.exists()) {
                  const subjectData = subjectDoc.data();
                  
                  // If this instructor was assigned to this subject, remove the assignment
                  if (subjectData.assignedInstructor === instructorId) {
                    await updateDoc(subjectRef, {
                      assignedInstructor: null,
                      lastInstructorChange: new Date(),
                      previousInstructor: instructorId
                    });
                    
                    console.log(`✅ [RoleChange] Removed instructor assignment from subject ${subjectId}`);
                  }
                }
              } catch (subjectError) {
                console.warn(`⚠️ [RoleChange] Failed to update subject ${subjectId}:`, subjectError);
              }
            }
            
            return true; // Indicates we handled the role change specially
          } else {
            // Just update the role (no subjects to clear)
            await updateDoc(instructorRef, {
              role: newRole,
              lastRoleChange: new Date(),
              previousRole: currentRole
            });
            
            console.log(`✅ [RoleChange] Updated role for ${instructorId} (no subjects to clear)`);
            return true;
          }
        }
      } catch (error) {
        console.error(`🔥 [RoleChange] Failed to clear subjectList for ${instructorId}:`, error);
        throw error;
      }
    } else if (newRole === "instructor" && currentRole !== "instructor") {
      // Changing TO instructor - just update role (they can be assigned subjects later)
      console.log(`[RoleChange] User ${instructorId} becoming instructor - keeping empty subjectList`);
      
      try {
        await updateDoc(doc(db, "instructors", instructorId), {
          role: newRole,
          subjectList: [], // Ensure clean slate for new instructor
          lastRoleChange: new Date(),
          previousRole: currentRole
        });
        
        console.log(`✅ [RoleChange] Updated ${instructorId} to instructor role`);
        return true;
      } catch (error) {
        console.error(`🔥 [RoleChange] Failed to update role for ${instructorId}:`, error);
        throw error;
      }
    }
    
    // Return false if we didn't handle the role change specially
    return false;
  };

  const buildChangedFields = () => {
    if (!isEdit) return [];
    const changes = [];
    if (initialData?.name !== formData.name) {
      changes.push({ field: "Name", from: initialData?.name || "", to: formData.name });
    }
    if (initialData?.role !== formData.role) {
      changes.push({ field: "Role", from: initialData?.role || "", to: formData.role });
    }
    // ID and Email are locked in edit mode.
    return changes;
  };

  // --- Submit: validate then open confirm modal ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const { id, name, email } = formData;

    if (!isFormValid()) {
      setError("Please complete all required fields.");
      return;
    }

    if (!isEdit) {
      // Duplicate ID check
      const idError = validateInstructorID(id);
      if (idError) return setError(idError);

      try {
        const ref = doc(db, "instructors", id.trim());
        const snap = await getDoc(ref);
        if (snap.exists()) return setError("Instructor ID already exists.");
      } catch {
        return setError("Failed to validate Instructor ID.");
      }

      // Email validation & duplicate check
      const emailValidationError = validateEmail(email);
      if (emailValidationError) return setError(emailValidationError);

      const isDup = await checkDuplicateEmail(email);
      if (isDup) return setError("Email already exists. Please use a different email.");

      setChangedFields([]);
      setShowConfirm(true);
      return;
    }

    // Edit: compute changed fields
    const changes = buildChangedFields();
    if (changes.length === 0) return setError("No changes to save.");
    setChangedFields(changes);
    setShowConfirm(true);
  };

  // --- Confirm: persist changes (create or update) ---
  const handleConfirm = async () => {
    setLoading(true);
    setError("");

    const { id, name, email, role } = formData;

    try {
      if (isEdit) {
        // Check if role is changing and handle it specially
        const roleChanged = initialData?.role !== role;
        
        if (roleChanged) {
          console.log(`[handleConfirm] Detected role change for ${id}: ${initialData?.role} -> ${role}`);
          
          // Use special role change handler
          const handled = await handleRoleChange(initialData, role);
          
          if (handled) {
            console.log("✅ [handleConfirm] Role change completed with special handling");
            // Role change handler already updated the document
          } else {
            // Fallback to normal update if role change wasn't handled specially
            await updateDoc(doc(db, "instructors", id), { name, role, email });
            console.log("✅ [handleConfirm] Normal role update completed");
          }
        } else {
          // No role change - normal update
          await updateDoc(doc(db, "instructors", id), { name, role, email });
          console.log("✅ [handleConfirm] Normal update completed (no role change)");
        }
      } else {
        // Create via callable function, then Firestore doc
        let uid = null;
        try {
          const createByAdmin = httpsCallable(functions, "createUserByAdmin");
          const resp = await createByAdmin({
            email,
            password: "TempPass123!",
            displayName: name,
            role: role || "instructor",
            id,
          });
          uid = resp?.data?.uid || resp?.data?.result?.uid || null;
        } catch {
          const createInstructorUser = httpsCallable(functions, "createInstructorUser");
          const resp2 = await createInstructorUser({ email, name });
          uid = resp2?.data?.uid || null;
        }

        await setDoc(doc(db, "instructors", id), {
          id,
          name,
          email,
          uid,
          role,
          mustChangePassword: true,
          subjectList: [], // Ensure new users start with empty subjectList
        });
      }

      onAdd?.(formData);
      setShowConfirm(false);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to save.");
      console.error("🔥 [handleConfirm] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const renderConfirmContent = () => {
    if (isEdit) {
      return (
        <div className="space-y-2">
          {changedFields.map((c) => (
            <div key={c.field} className="text-sm">
              <span className="font-semibold">{c.field}: </span>
              <span className="text-gray-600">{String(c.from)}</span>
              <span className="mx-2">--&gt;</span>
              <span className="text-gray-900">{String(c.to)}</span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="text-sm space-y-1">
        <div><span className="font-semibold">ID:</span> {formData.id}</div>
        <div><span className="font-semibold">Name:</span> {formData.name}</div>
        <div><span className="font-semibold">Email:</span> {formData.email}</div>
        <div><span className="font-semibold">Role:</span> {formData.role}</div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-6 animate-fade-in">
          <h2 className="text-lg font-semibold mb-4">
            {isEdit ? "Edit User" : "Add User"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              name="id"
              value={formData.id}
              placeholder="User ID (11 digits)"
              onChange={handleChange}
              disabled={isEdit}
              maxLength={11}
              className={`w-full border px-3 py-2 rounded ${isEdit ? "bg-gray-100 cursor-not-allowed" : ""}`}
            />

            <input
              name="name"
              placeholder="Name"
              value={formData.name}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded"
            />

            <div className="relative">
              <input
                name="email"
                type="email"
                placeholder="Email (e.g., username@vigan.sti.edu.ph)"
                value={formData.email}
                onChange={handleChange}
                disabled={isEdit}
                className={`w-full border px-3 py-2 rounded ${
                  emailError && !isEdit ? "border-red-500" : ""
                } ${isEdit ? "bg-gray-100 cursor-not-allowed" : ""}`}
              />
              {emailError && formData.email && !isEdit && (
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
                onClick={() => onClose?.()}
                className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isFormValid() || loading}
                className={`px-6 py-2 rounded text-white ${
                  isFormValid() && !loading ? "bg-blue-700 hover:bg-blue-800" : "bg-gray-300 cursor-not-allowed"
                }`}
              >
                {isEdit ? "Review Changes" : "Review Create"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl p-6">
            <h3 className="text-lg font-semibold mb-3">
              {isEdit ? "Confirm Changes?" : "Create User?"}
            </h3>
            {renderConfirmContent()}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  onClose?.(); // Discard on cancel
                }}
                className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="bg-blue-700 text-white px-6 py-2 rounded hover:bg-blue-800 disabled:bg-gray-300"
                disabled={loading}
              >
                {loading ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AddInstructor;

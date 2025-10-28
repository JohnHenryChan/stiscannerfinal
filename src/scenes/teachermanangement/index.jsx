import React, { useState, useEffect } from "react";
import { MdSearch } from "react-icons/md";
import { FaTrash, FaPen } from "react-icons/fa";
import SidebarAdmin from "../global/SidebarAdmin";
import TopbarAdmin from "../global/TopbarAdmin";
import AddInstructor from "../../components/AddInstructor";
// import EditSubjectListModal from "../../components/EditSubjectListModal"; // removed
// import ConfirmModal from "../../components/ConfirmModal"; // removed: use local modal declared here
import { db, functions } from "../../firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  setDoc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../../context/AuthContext";
import AccessDenied from "../../components/AccessDenied";

// NOTE: instructor.id = Firestore doc id (instructors/{id})
//       instructor.uid = Firebase Auth UID (used by Cloud Function)

// Local confirm modal (disable BOTH buttons while deleting)
const LocalConfirmModal = ({
  visible,
  title = "Confirm",
  message = "",
  onConfirm,
  onCancel,
  confirmDisabled = false,
  confirmText = "Confirm",
}) => {
  if (!visible) return null;

  const baseBtn = "px-4 py-2 rounded";
  const disableUX = "opacity-60 cursor-not-allowed pointer-events-none";
  const cancelEnabled = `${baseBtn} border border-gray-300 text-gray-700 hover:bg-gray-100`;
  const cancelDisabledStyles = `${baseBtn} border border-gray-200 text-gray-400 bg-gray-100 ${disableUX}`;
  const confirmEnabled = `${baseBtn} bg-red-600 text-white hover:bg-red-700`;
  const confirmDisabledStyles = `${baseBtn} bg-gray-300 text-gray-600 ${disableUX}`;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
      <div className="bg-white rounded-md shadow-lg w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirmDisabled}
            aria-disabled={confirmDisabled}
            className={confirmDisabled ? cancelDisabledStyles : cancelEnabled}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            aria-disabled={confirmDisabled}
            className={confirmDisabled ? confirmDisabledStyles : confirmEnabled}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

const InstructorManagement = () => {
  const { user } = useAuth();
  const role = user?.role || "unknown";
  const isAdmin = role === "admin";

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [instructors, setInstructors] = useState([]);
  const [editingData, setEditingData] = useState(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [instructorToDelete, setInstructorToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch instructors
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "instructors"), (snap) => {
      setInstructors(snap.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    });
    return () => unsub();
  }, []);

  const handleOpen = () => {
    setEditingData(null);
    setTimeout(() => setIsModalOpen(true), 0);
  };

  const handleClose = () => setIsModalOpen(false);

  // Create Fire Auth user via callable, then persist Firestore instructor doc
  const handleSubmit = async (data) => {
    // Persistence is handled inside AddInstructor after confirm.
    setEditingData(null);
    setIsModalOpen(false);
  };

  const handleEdit = (index) => {
    setEditingData(instructors[index]);
    setIsModalOpen(true);
  };

  const handleDelete = (index) => {
    setInstructorToDelete(instructors[index]);
    setIsDeleteModalOpen(true);
  };

  // Cancel: just close modal (no safe-restore logic)
  const cancelDelete = () => {
    setIsDeleteModalOpen(false);
    setInstructorToDelete(null);
    setIsDeleting(false);
  };

  // Confirm: disable both buttons, delete Auth user (if any) then Firestore doc. Log all steps.
  const confirmDelete = async () => {
    if (!instructorToDelete) return;
    setIsDeleting(true);

    const { id: instructorId, uid, email, name } = instructorToDelete;

    console.log(`[Delete] Begin for instructorId=${instructorId}, uid=${uid || "n/a"}, email=${email || "n/a"}`);

    // 1) Delete Firebase Auth user by UID via Cloud Function
    try {
      if (uid) {
        console.log(`[Delete] Calling deleteUserByUid for uid=${uid}`);
        const deleteUser = httpsCallable(functions, "deleteUserByUid");
        const res = await deleteUser({ uid, email: email || null });
        console.log("[Delete] Auth delete response:", res?.data || res);
      } else {
        console.warn("[Delete] No uid on instructor document; skipping Auth delete.");
      }
    } catch (err) {
      const msg = String(err?.message || err);
      console.warn("[Delete] Auth delete failed (continuing to Firestore):", msg);
    }

    // 2) Delete Firestore instructor document
    try {
      console.log(`[Delete] Deleting Firestore document instructors/${instructorId} (${name || "Unnamed"})`);
      await deleteDoc(doc(db, "instructors", instructorId));
      console.log("[Delete] Firestore document deleted:", instructorId);
    } catch (err) {
      console.error("[Delete] Firestore delete failed:", err?.message || err);
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
      setInstructorToDelete(null);
      console.log("[Delete] Finished");
    }
  };

  const filteredInstructors = instructors.filter((inst) =>
    Object.values(inst)
      .filter((v) => typeof v === "string")
      .some((val) => val.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col min-h-screen">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />
        <div className="flex flex-col flex-grow px-8 py-6 bg-white">
          <h1 className="text-2xl font-semibold mb-4">User Management</h1>

          {/* 🔍 Search + Add */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center border rounded-md px-3 py-2 bg-white shadow-md w-64">
                <MdSearch className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Search"
                  className="outline-none px-2 w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={handleOpen}
              className="bg-[#0057A4] text-white px-6 py-2 rounded-sm shadow hover:bg-blue-800 transition-all"
            >
              Add New User
            </button>
          </div>

          {/* 📋 Table */}
          <div className="overflow-x-auto shadow rounded-lg">
            <table className="min-w-full table-auto border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-4 border">Name</th>
                  <th className="py-2 px-4 border">User ID</th>
                  <th className="py-2 px-4 border">Role</th>
                  <th className="py-2 px-4 border">Email</th>
                  <th className="py-2 px-4 border">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInstructors.map((inst, index) => (
                  <tr key={index} className="text-center">
                    <td className="py-2 px-4 border">{inst.name || "—"}</td>
                    <td className="py-2 px-4 border">{inst.id || "—"}</td>
                    <td className="py-2 px-4 border capitalize">
                      {inst.role || "instructor"}
                    </td>
                    <td className="py-2 px-4 border">{inst.email || "—"}</td>
                    <td className="py-2 px-4 border">
                      <div className="flex justify-center gap-4">
                        <button onClick={() => handleEdit(index)}>
                          <FaPen className="text-black hover:text-blue-600 cursor-pointer" />
                        </button>
                        <button onClick={() => handleDelete(index)}>
                          <FaTrash className="text-red-600 hover:text-red-800 cursor-pointer" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredInstructors.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-4 text-center text-gray-500 italic"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Modals */}
          <AddInstructor
            key={isModalOpen ? "open" : "closed"}
            visible={isModalOpen}
            onClose={handleClose}
            onAdd={handleSubmit}
            initialData={editingData}
          />

          {/* removed: EditSubjectListModal */}

          <LocalConfirmModal
            visible={isDeleteModalOpen}
            title="Confirm Deletion"
            message={`Are you sure you want to delete ${instructorToDelete?.name || "this user"}? (${instructorToDelete?.email || "no email"})`}
            onConfirm={confirmDelete}
            onCancel={cancelDelete}
            confirmDisabled={isDeleting}
            confirmText={isDeleting ? "Deleting..." : "Confirm"}
          />
        </div>
      </div>
    </div>
  );
};

export default InstructorManagement;

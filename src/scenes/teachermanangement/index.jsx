import React, { useState, useEffect } from "react";
import { MdSearch } from "react-icons/md";
import { FaTrash, FaPen, FaPlus } from "react-icons/fa";
import SidebarAdmin from "../global/SidebarAdmin";
import TopbarAdmin from "../global/TopbarAdmin";
import AddInstructor from "../../components/AddInstructor";
import EditSubjectListModal from "../../components/EditSubjectListModal";
import ConfirmModal from "../../components/ConfirmModal";
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

const InstructorManagement = () => {
  const { user } = useAuth();
  const role = user?.role || "unknown";
  const isAdmin = role === "admin";

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [instructors, setInstructors] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [editingData, setEditingData] = useState(null);

  const [isEditSubjectsOpen, setIsEditSubjectsOpen] = useState(false);
  const [currentInstructorSubjects, setCurrentInstructorSubjects] = useState([]);
  const [selectedInstructorId, setSelectedInstructorId] = useState("");
  const [selectedInstructorName, setSelectedInstructorName] = useState("");

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [instructorToDelete, setInstructorToDelete] = useState(null);

 

  // Fetch instructors
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "instructors"), (snap) => {
      setInstructors(snap.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    });
    return () => unsub();
  }, []);

  // Fetch subject list
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "subjectList"), (snap) => {
      setSubjects(snap.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    });
    return () => unsub();
  }, []);

  const getSubjectNames = (ids) => {
    return ids?.length
      ? ids
          .map((id) => {
            const subj = subjects.find((s) => s.id === id);
            return subj ? `${subj.subject} (${subj.yearLevel})` : null;
          })
          .filter(Boolean)
          .join(", ")
      : "—";
  };

  const handleOpen = () => {
    setEditingData(null);
    setTimeout(() => setIsModalOpen(true), 0);
  };

  const handleClose = () => setIsModalOpen(false);

  const handleSubmit = async (data) => {
    // Skip existence check if editing
    if (!editingData) {
      const ref = doc(db, "instructors", data.id);
      const exists = await getDoc(ref);
      if (exists.exists()) {
        console.warn("❌ Duplicate ID detected, skipping");
        return;
      }
    }

    //await setDoc(doc(db, "instructors", data.id), data, { merge: true });
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

  const confirmDelete = async () => {
    if (instructorToDelete) {
      // Delete Firestore doc
      await deleteDoc(doc(db, "instructors", instructorToDelete.id));

      // Delete Auth user
      if (instructorToDelete.uid) {
        try {
          const deleteUser = httpsCallable(functions, "deleteUserByUid");
          await deleteUser({ uid: instructorToDelete.uid });
          console.log("✅ Auth user deleted:", instructorToDelete.uid);
        } catch (err) {
          console.error("🔥 Failed to delete auth user:", err.message);
        }
      }

      setInstructorToDelete(null);
      setIsDeleteModalOpen(false);
    }
  };

  const openEditSubjectsModal = (instructor) => {
    setSelectedInstructorId(instructor.id);
    setSelectedInstructorName(instructor.name || "Instructor");
    setCurrentInstructorSubjects(instructor.subjectList || []);
    setIsEditSubjectsOpen(true);
  };

  const handleSubjectListSave = async (updatedList) => {
    await updateDoc(doc(db, "instructors", selectedInstructorId), {
      subjectList: updatedList,
    });
    setIsEditSubjectsOpen(false);
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
          <h1 className="text-2xl font-semibold mb-4">Instructor Management</h1>

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
              Add Instructor
            </button>
          </div>

          {/* 📋 Table */}
          <div className="overflow-x-auto shadow rounded-lg">
            <table className="min-w-full table-auto border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-4 border">Instructor Name</th>
                  <th className="py-2 px-4 border">Instructor ID</th>
                  <th className="py-2 px-4 border">Role</th> {/* ✅ Added Role */}
                  <th className="py-2 px-4 border">Subject List</th>
                  <th className="py-2 px-4 border">Edit Subjects</th>
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
                    <td className="py-2 px-4 border whitespace-normal max-w-xs">
                      {getSubjectNames(inst.subjectList)}
                    </td>
                    <td className="py-2 px-4 border">
                      <button
                        onClick={() => openEditSubjectsModal(inst)}
                        className="text-blue-600 hover:text-blue-800 text-lg"
                        title="Edit Subjects"
                      >
                        <FaPlus />
                      </button>
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
                      colSpan={7}
                      className="py-4 text-center text-gray-500 italic"
                    >
                      No instructors found.
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

          <EditSubjectListModal
            visible={isEditSubjectsOpen}
            onClose={() => setIsEditSubjectsOpen(false)}
            onSave={handleSubjectListSave}
            subjects={subjects}
            selectedSubjects={currentInstructorSubjects}
            instructorName={selectedInstructorName}
          />

          <ConfirmModal
            visible={isDeleteModalOpen}
            title="Confirm Deletion"
            message={`Are you sure you want to delete ${instructorToDelete?.name}?`}
            onConfirm={confirmDelete}
            onCancel={() => {
              setInstructorToDelete(null);
              setIsDeleteModalOpen(false);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default InstructorManagement;

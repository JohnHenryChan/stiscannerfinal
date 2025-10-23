// StudentManagement.jsx
import React, { useState, useEffect } from 'react';
import SidebarAdmin from '../global/SidebarAdmin';
import TopbarAdmin from '../global/TopbarAdmin';
import { MdSearch, MdEdit, MdDelete } from "react-icons/md";
import { db } from '../../firebaseConfig';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import AddStudent from '../../components/AddStudent';
import ImportModal from '../../components/ImportModal';
import ConfirmModal from '../../components/ConfirmModal';

const StudentManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [students, setStudents] = useState([]);
  const [editingStudent, setEditingStudent] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // batch selection + deletion
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // filters
  const [programFilter, setProgramFilter] = useState("All Programs");
  const [yearFilter, setYearFilter] = useState("All Years");

  // confirm modal state for deletions
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState(null); // single deletion
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false); // batch deletion flag

  // Fetch all students
  const fetchStudents = async () => {
    const snapshot = await getDocs(collection(db, "students"));
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setStudents(data);
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // open confirm for single delete (no immediate delete)
  const handleDelete = (studentId) => {
    setPendingDeleteId(studentId);
    setPendingBatchDelete(false);
    setConfirmMessage("Are you sure? The selected student will be deleted.");
    setConfirmVisible(true);
  };

  // open confirm for batch delete (no immediate delete)
  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    setPendingBatchDelete(true);
    setPendingDeleteId(null);
    setConfirmMessage("Are you sure? All selected students will be deleted.");
    setConfirmVisible(true);
  };

  // actual deletion executed after user confirms in modal
  const handleConfirmDelete = async () => {
    setConfirmVisible(false);
    setIsDeleting(true);

    try {
      if (pendingBatchDelete) {
        // batch delete selectedIds
        for (const id of selectedIds) {
          await deleteDoc(doc(db, "students", id));
        }
        setStudents(prev => prev.filter(s => !selectedIds.includes(s.id)));
        setSelectedIds([]);
      } else if (pendingDeleteId) {
        await deleteDoc(doc(db, "students", pendingDeleteId));
        setStudents(prev => prev.filter(student => student.id !== pendingDeleteId));
        setSelectedIds(prev => prev.filter(id => id !== pendingDeleteId));
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Error deleting student(s). See console for details.");
    } finally {
      setPendingDeleteId(null);
      setPendingBatchDelete(false);
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setConfirmVisible(false);
    setPendingDeleteId(null);
    setPendingBatchDelete(false);
  };

  // Edit student
  const handleEdit = (student) => {
    setEditingStudent(student);
    setShowModal(true);
  };

  // After add/edit
  const handleUpdate = (updatedStudent) => {
    setStudents(prev => {
      const exists = prev.find(s => s.id === updatedStudent.id);
      if (exists) {
        return prev.map(s => (s.id === updatedStudent.id ? updatedStudent : s));
      }
      return [...prev, updatedStudent];
    });
    setShowModal(false);
    setEditingStudent(null);
  };

  // After Excel import
  const handleImportStudents = () => {
    fetchStudents();
    setShowImportModal(false);
  };

  // selection helpers
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    const visibleIds = filteredStudents.map(s => s.id);
    const allSelected = visibleIds.every(id => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : visibleIds);
  };

  // Dynamic filter options derived from students
  const distinctPrograms = ["All Programs", ...Array.from(new Set(students.map(s => s.program).filter(Boolean)))];
  const distinctYears = ["All Years", ...Array.from(new Set(students.map(s => s.year || s.yearLevel).filter(Boolean)))];

  // Search + filters
  const filteredStudents = students.filter((student) => {
    const fullName = `${student.firstName || ''} ${student.lastName || ''}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchTerm.toLowerCase()) ||
      (student.id || '').includes(searchTerm);
    const matchesProgram = programFilter === "All Programs" || (student.program || "N/A") === programFilter;
    const studentYear = student.year || student.yearLevel || "N/A";
    const matchesYear = yearFilter === "All Years" || studentYear === yearFilter;
    return matchesSearch && matchesProgram && matchesYear;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />
        <div className="flex-1 p-6">
          <h1 className="text-2xl mb-4 font-bold">Student Management</h1>

          {/* Controls */}
          <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
            <div className="flex items-center border rounded-md px-3 py-2 bg-white shadow-md w-1/3">
              <MdSearch className="text-gray-500" />
              <input
                type="text"
                placeholder="Search by name or ID"
                className="outline-none px-2 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={programFilter}
                onChange={(e) => setProgramFilter(e.target.value)}
                className="border px-3 py-2 rounded-md bg-white"
              >
                {distinctPrograms.map((p, idx) => (
                  <option key={idx} value={p}>{p}</option>
                ))}
              </select>

              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="border px-3 py-2 rounded-md bg-white"
              >
                {distinctYears.map((y, idx) => (
                  <option key={idx} value={y}>{y}</option>
                ))}
              </select>

              <button
                className="bg-green-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-green-700 transition"
                onClick={() => setShowImportModal(true)}
              >
                Import Students
              </button>
              <button
                className="bg-[#0057A4] text-white px-4 py-2 rounded-md shadow-md hover:bg-[#004080] transition"
                onClick={() => {
                  setEditingStudent(null);
                  setShowModal(true);
                }}
              >
                Add Student
              </button>
            </div>
          </div>

          {/* Batch actions */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  onChange={toggleSelectAll}
                  checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.includes(s.id))}
                />
                <span className="text-sm">Select visible</span>
              </label>

              <button
                className="bg-red-600 text-white px-3 py-1 rounded disabled:opacity-50"
                onClick={handleBatchDelete}
                disabled={selectedIds.length === 0 || isDeleting}
              >
                {isDeleting ? "Deleting..." : `Delete Selected (${selectedIds.length})`}
              </button>

              <button
                className="bg-gray-200 text-gray-800 px-3 py-1 rounded"
                onClick={() => setSelectedIds([])}
                disabled={selectedIds.length === 0}
              >
                Clear Selection
              </button>
            </div>

            <div className="text-sm text-gray-600">
              Showing {filteredStudents.length} of {students.length}
            </div>
          </div>

          {/* Student Table */}
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black px-4 py-2">
                  {/* empty for checkbox column */}
                </th>
                <th className="border border-black px-4 py-2">Student ID</th>
                <th className="border border-black px-4 py-2">Name</th>
                <th className="border border-black px-4 py-2">Program</th>
                <th className="border border-black px-4 py-2">Year</th>
                <th className="border border-black px-4 py-2">RFID</th>
                <th className="border border-black px-4 py-2">Contact</th>
                <th className="border border-black px-4 py-2">Guardian</th>
                <th className="border border-black px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="border border-black hover:bg-gray-50">
                    <td className="border border-black px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(student.id)}
                        onChange={() => toggleSelect(student.id)}
                      />
                    </td>
                    <td className="border border-black px-4 py-2">{student.id}</td>
                    <td className="border border-black px-4 py-2">
                      {`${student.firstName || ''} ${student.lastName || ''}`}
                    </td>
                    <td className="border border-black px-4 py-2">{student.program || "—"}</td>
                    <td className="border border-black px-4 py-2">{student.year || student.yearLevel || 'N/A'}</td>
                    <td className="border border-black px-4 py-2">{student.rfid || "—"}</td>
                    <td className="border border-black px-4 py-2">{student.contact || "—"}</td>
                    <td className="border border-black px-4 py-2">
                      {student.guardian ? `${student.guardian} (${student.guardianContact || "—"})` : "—"}
                    </td>
                    <td className="border border-black px-4 py-2 text-center">
                      <button
                        className="text-blue-600 hover:text-blue-800 mx-2"
                        onClick={() => handleEdit(student)}
                      >
                        <MdEdit size={20} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 mx-2"
                        onClick={() => handleDelete(student.id)}
                      >
                        <MdDelete size={20} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="text-center py-4 text-gray-500 italic">
                    No matching students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Add/Edit Student Modal */}
          {showModal && (
            <AddStudent
              onClose={() => setShowModal(false)}
              onAdd={handleUpdate}
              initialData={editingStudent}
              hideCancel={false}
              subjectID={null}
              visible={showModal}
            />
          )}

          {/* Import Excel Modal */}
          {showImportModal && (
            <ImportModal
              onClose={() => setShowImportModal(false)}
              onImport={handleImportStudents}
            />
          )}

          {/* Confirm Modal for deletions */}
          <ConfirmModal
            visible={confirmVisible}
            title="Student Deletion"
            message={confirmMessage}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
          />
        </div>
      </div>
    </div>
  );
};

export default StudentManagement;

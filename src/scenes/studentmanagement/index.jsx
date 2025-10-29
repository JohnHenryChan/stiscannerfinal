// StudentManagement.jsx
import React, { useState, useEffect } from 'react';
import SidebarAdmin from '../global/SidebarAdmin';
import TopbarAdmin from '../global/TopbarAdmin';
import { MdSearch, MdEdit, MdDelete } from "react-icons/md";
import { db } from '../../firebaseConfig';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import AddStudent from '../../components/AddStudent';
import ImportModal from '../../components/ImportModal';
import ConfirmModal from '../../components/ConfirmModal';

const StudentManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [students, setStudents] = useState([]);
  const [editingStudent, setEditingStudent] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // batch selection & confirm modal state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmItems, setConfirmItems] = useState([]); // array of student objects to delete
  const [filterYear, setFilterYear] = useState("All");
  const [filterProgram, setFilterProgram] = useState("All");

  // Fetch all students
  const fetchStudents = async () => {
    const snapshot = await getDocs(collection(db, "students"));
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setStudents(data);
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // Delete student(s) helper (deletes student doc, attendance docs, and subject subcollection references)
  const performDelete = async (items) => {
    if (!items || items.length === 0) return;
    
    console.log("🗑️ [performDelete] Starting deletion for", items.length, "students");
    
    try {
      for (const student of items) {
        console.log("🗑️ [performDelete] Processing student:", student.id, student.firstName, student.lastName);
        
        // 1. Delete attendance docs for this student
        try {
          console.log("📊 [performDelete] Deleting attendance records for student:", student.id);
          const attQ = query(collection(db, "attendance"), where("studentId", "==", student.id));
          const attSnap = await getDocs(attQ);
          console.log("📊 [performDelete] Found", attSnap.docs.length, "attendance records");
          
          for (const attDoc of attSnap.docs) {
            await deleteDoc(doc(db, "attendance", attDoc.id));
            console.log("✅ [performDelete] Deleted attendance record:", attDoc.id);
          }
        } catch (e) {
          console.warn("⚠️ [performDelete] Failed to delete attendance for", student.id, e);
        }

        // 2. Delete student references from ALL subject subcollections
        try {
          console.log("📚 [performDelete] Removing student from subject subcollections:", student.id);
          
          // Get all subjects
          const subjectsSnapshot = await getDocs(collection(db, "subjectList"));
          console.log("📚 [performDelete] Found", subjectsSnapshot.docs.length, "subjects to check");
          
          for (const subjectDoc of subjectsSnapshot.docs) {
            const subjectId = subjectDoc.id;
            
            // Check if student exists in this subject's students subcollection
            const studentInSubjectRef = doc(db, "subjectList", subjectId, "students", student.id);
            
            try {
              // Try to delete the student document from this subject
              await deleteDoc(studentInSubjectRef);
              console.log(`✅ [performDelete] Removed student ${student.id} from subject ${subjectId}`);
            } catch (deleteError) {
              // Student likely doesn't exist in this subject - this is fine
              if (deleteError.code === 'not-found') {
                console.log(`ℹ️ [performDelete] Student ${student.id} not found in subject ${subjectId} (normal)`);
              } else {
                console.warn(`⚠️ [performDelete] Error removing student ${student.id} from subject ${subjectId}:`, deleteError);
              }
            }
          }
        } catch (e) {
          console.error("🔥 [performDelete] Failed to remove student from subject subcollections:", student.id, e);
        }

        // 3. Delete main student document
        try {
          console.log("👤 [performDelete] Deleting main student document:", student.id);
          await deleteDoc(doc(db, "students", student.id));
          console.log("✅ [performDelete] Deleted main student document:", student.id);
        } catch (e) {
          console.warn("⚠️ [performDelete] Failed to delete student doc", student.id, e);
        }
        
        console.log("🎯 [performDelete] Completed deletion for student:", student.id);
      }

      // Update local state
      const deletedIds = new Set(items.map(item => item.id));
      setStudents(prev => prev.filter(s => !deletedIds.has(s.id)));
      
      // Clear selection
      setSelectedIds(new Set());
      setSelectAll(false);
      
      console.log("✅ [performDelete] Successfully deleted", items.length, "students and updated UI");
      
    } catch (err) {
      console.error("🔥 [performDelete] Critical error during deletion:", err);
    } finally {
      setConfirmVisible(false);
      setConfirmItems([]);
    }
  };

  // Called when clicking the single delete icon
  const handleDelete = (student) => {
    setConfirmItems([student]);
    setConfirmVisible(true);
  };

  // Called when user confirms in modal (single or batch)
  const handleConfirmDelete = async () => {
    await performDelete(confirmItems);
  };

  // batch delete trigger
  const openBatchDelete = () => {
    if (!selectedIds || selectedIds.size === 0) return;
    const items = students.filter(s => selectedIds.has(s.id));
    if (items.length === 0) return;
    setConfirmItems(items);
    setConfirmVisible(true);
  };

  // toggle selection for a single row
  const toggleRowSelection = (studentId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      // update selectAll flag based on visible filtered list length
      const visibleIds = filteredStudents.map(s => s.id);
      setSelectAll(visibleIds.length > 0 && visibleIds.every(id => next.has(id)));
      return next;
    });
  };

  // toggle select all (visible rows)
  const toggleSelectAll = () => {
    const visibleIds = filteredStudents.map(s => s.id);
    if (selectAll) {
      // currently all selected -> clear those
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
      setSelectAll(false);
    } else {
      // add all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
      setSelectAll(true);
    }
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

  // Year filter options
  const years = Array.from(new Set(students.map(s => s.year || s.yearLevel).filter(Boolean))).sort();
  // Program filter options
  const programs = Array.from(new Set(students.map(s => s.program).filter(Boolean))).sort();

  // Search + filter
  const filteredStudents = students
    .filter((student) => {
      if (filterYear && filterYear !== "All") {
        const sy = student.year || student.yearLevel;
        if (String(sy) !== String(filterYear)) return false;
      }
      if (filterProgram && filterProgram !== "All") {
        if ((student.program || "") !== String(filterProgram)) return false;
      }
      return (
        (student.firstName + " " + student.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.id && student.id.toLowerCase && student.id.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    });

  return (
    <div className="flex flex-col min-h-screen">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />
        <div className="flex-1 p-6">
          <h1 className="text-2xl mb-4 font-bold">Student Management</h1>

          {/* Controls */}
          <div className="flex justify-between items-center mb-4">
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

            {/* Filters & batch actions */}
            <div className="flex gap-3 items-center">
              <select
                className="border rounded px-2 py-1"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
              >
                <option value="All">All Years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                className="border rounded px-2 py-1"
                value={filterProgram}
                onChange={(e) => setFilterProgram(e.target.value)}
              >
                <option value="All">All Programs</option>
                {programs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <button
                className={`bg-red-600 text-white px-4 py-2 rounded-md shadow-md transition ${selectedIds.size === 0 ? "opacity-50 cursor-not-allowed" : ""}`}

                onClick={openBatchDelete}
                disabled={selectedIds.size === 0}
              >
                Delete Selected ({selectedIds.size})
              </button>

              <div className="flex gap-3">
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
          </div>

          {/* Student Table */}
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black px-4 py-2">
                  <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} />
                </th>
                <th className="border border-black px-4 py-2">Student ID</th>
                <th className="border border-black px-4 py-2">Name</th>
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
                        checked={selectedIds.has(student.id)}
                        onChange={() => toggleRowSelection(student.id)}
                      />
                    </td>
                    <td className="border border-black px-4 py-2">{student.id}</td>
                    <td className="border border-black px-4 py-2">
                      {`${student.firstName || ''} ${student.lastName || ''}`}
                    </td>
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
                        onClick={() => handleDelete(student)}
                      >
                        <MdDelete size={20} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="text-center py-4 text-gray-500 italic">
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

          {/* Confirm modal for single or batch deletion */}
          <ConfirmModal
            visible={confirmVisible}
            title="Confirm Deletion?"
            message={
              <div>
                <div>Are you sure you want to delete student information and attendance records for the following students:</div>
                <ul className="mt-2 text-left list-disc pl-5 max-h-40 overflow-auto">
                  {confirmItems.map(s => (
                    <li key={s.id}>{`${s.id} - ${s.lastName || ""}, ${s.firstName || ""}`}</li>
                  ))}
                </ul>
              </div>
            }
            onConfirm={handleConfirmDelete}
            onCancel={() => { setConfirmVisible(false); setConfirmItems([]); }}
          />
        </div>
      </div>
    </div>
  );
};

export default StudentManagement;

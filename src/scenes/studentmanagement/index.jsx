// StudentManagement.jsx
import React, { useState, useEffect } from 'react';
import SidebarAdmin from '../global/SidebarAdmin';
import TopbarAdmin from '../global/TopbarAdmin';
import { MdSearch, MdEdit, MdDelete } from "react-icons/md";
import { db } from '../../firebaseConfig';
import { collection, getDocs, deleteDoc, doc, query, where, getDoc } from 'firebase/firestore';
import AddStudent from '../../components/AddStudent';
import ImportModal from '../../components/ImportModal';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';

const StudentManagement = () => {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState(null);
  const [ownedSubjectIds, setOwnedSubjectIds] = useState([]);
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

  // Check if user can edit students (only admin and registrar)
  const canEditStudents = userRole === "admin" || userRole === "registrar";

  // === Fetch user role and owned subjects ===
  useEffect(() => {
    const fetchUserRoleAndSubjects = async () => {
      if (!user?.uid) {
        setUserRole(null);
        setOwnedSubjectIds([]);
        return;
      }

      try {
        // Get user role from multiple possible sources
        let role = user.role || "student";
        let ownedIds = [];

        // Check instructors collection for role and owned subjects
        let instrDoc = await getDoc(doc(db, "instructors", user.uid));
        
        // Fallback: query by uid if document doesn't exist by uid
        if (!instrDoc.exists()) {
          const instrQuery = query(collection(db, "instructors"), where("uid", "==", user.uid));
          const instrSnap = await getDocs(instrQuery);
          if (!instrSnap.empty) {
            instrDoc = instrSnap.docs[0];
          }
        }

        if (instrDoc.exists()) {
          const instrData = instrDoc.data();
          role = instrData.role || "instructor";
          
          // Get owned subjects for instructors
          if (role === "instructor") {
            const subjectList = instrData.subjectList || [];
            ownedIds = Array.isArray(subjectList) ? subjectList.map(String) : [];
          }
        }

        // Check other role collections if not found in instructors
        if (role === "student") {
          // Check admins collection
          const adminDoc = await getDoc(doc(db, "admins", user.uid));
          if (adminDoc.exists()) {
            role = "admin";
          } else {
            // Check guidance collection
            const guidanceDoc = await getDoc(doc(db, "guidance", user.uid));
            if (guidanceDoc.exists()) {
              role = "guidance";
            } else {
              // Check registrar collection
              const registrarDoc = await getDoc(doc(db, "registrars", user.uid));
              if (registrarDoc.exists()) {
                role = "registrar";
              }
            }
          }
        }

        console.log("[StudentManagement] User role and subjects:", { 
          uid: user.uid, 
          role, 
          ownedSubjects: ownedIds 
        });

        setUserRole(role);
        setOwnedSubjectIds(ownedIds);

      } catch (err) {
        console.error("[StudentManagement] Failed to fetch user role/subjects:", err);
        setUserRole("student");
        setOwnedSubjectIds([]);
      }
    };

    fetchUserRoleAndSubjects();
  }, [user]);

  // Fetch students with instructor filtering
  const fetchStudents = async () => {
    try {
      // If instructor with no owned subjects, return empty array
      if (userRole === "instructor" && (!ownedSubjectIds || ownedSubjectIds.length === 0)) {
        console.log("[StudentManagement] Instructor has no owned subjects, showing empty list");
        setStudents([]);
        return;
      }

      // For admin/guidance/registrar - get all students
      if (userRole !== "instructor") {
        const snapshot = await getDocs(collection(db, "students"));
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStudents(data);
        return;
      }

      // For instructors - get only students from their subjects
      const studentSet = new Set();
      
      for (const subjectId of ownedSubjectIds) {
        try {
          const subjectStudentsSnap = await getDocs(collection(db, "subjectList", subjectId, "students"));
          
          for (const studentDoc of subjectStudentsSnap.docs) {
            const studentId = studentDoc.id;
            
            // Get full student data from main students collection
            const mainStudentDoc = await getDoc(doc(db, "students", studentId));
            if (mainStudentDoc.exists()) {
              const studentData = { id: studentId, ...mainStudentDoc.data() };
              studentSet.add(JSON.stringify(studentData)); // Use JSON to avoid duplicates
            }
          }
        } catch (err) {
          console.warn(`[StudentManagement] Error fetching students for subject ${subjectId}:`, err);
        }
      }

      // Convert back to array and parse JSON
      const uniqueStudents = Array.from(studentSet).map(studentJson => JSON.parse(studentJson));
      
      console.log(`[StudentManagement] Instructor sees ${uniqueStudents.length} students from ${ownedSubjectIds.length} subjects`);
      setStudents(uniqueStudents);

    } catch (err) {
      console.error("[StudentManagement] Error fetching students:", err);
      setStudents([]);
    }
  };

  useEffect(() => {
    // Only fetch when we have role information
    if (userRole !== null) {
      fetchStudents();
    }
  }, [userRole, ownedSubjectIds]);

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

        // 2. Delete student references from subject subcollections
        try {
          console.log("📚 [performDelete] Removing student from subject subcollections:", student.id);
          
          // For instructors, only remove from their own subjects
          const subjectsToCheck = userRole === "instructor" ? ownedSubjectIds : [];
          
          // For admin/registrar, get all subjects
          if (userRole !== "instructor") {
            const subjectsSnapshot = await getDocs(collection(db, "subjectList"));
            subjectsToCheck.push(...subjectsSnapshot.docs.map(doc => doc.id));
          }
          
          console.log("📚 [performDelete] Checking", subjectsToCheck.length, "subjects");
          
          for (const subjectId of subjectsToCheck) {
            const studentInSubjectRef = doc(db, "subjectList", subjectId, "students", student.id);
            
            try {
              await deleteDoc(studentInSubjectRef);
              console.log(`✅ [performDelete] Removed student ${student.id} from subject ${subjectId}`);
            } catch (deleteError) {
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

        // 3. Delete main student document (only for admin/registrar)
        if (canEditStudents) {
          try {
            console.log("👤 [performDelete] Deleting main student document:", student.id);
            await deleteDoc(doc(db, "students", student.id));
            console.log("✅ [performDelete] Deleted main student document:", student.id);
          } catch (e) {
            console.warn("⚠️ [performDelete] Failed to delete student doc", student.id, e);
          }
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

              {canEditStudents && (
                <button
                  className={`bg-red-600 text-white px-4 py-2 rounded-md shadow-md transition ${selectedIds.size === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={openBatchDelete}
                  disabled={selectedIds.size === 0}
                >
                  Delete Selected ({selectedIds.size})
                </button>
              )}

              <div className="flex gap-3">
                {canEditStudents && (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Student Table */}
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr className="bg-gray-200">
                {canEditStudents && (
                  <th className="border border-black px-4 py-2">
                    <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} />
                  </th>
                )}
                <th className="border border-black px-4 py-2">Student ID</th>
                <th className="border border-black px-4 py-2">Name</th>
                <th className="border border-black px-4 py-2">Year</th>
                <th className="border border-black px-4 py-2">RFID</th>
                <th className="border border-black px-4 py-2">Contact</th>
                <th className="border border-black px-4 py-2">Guardian</th>
                {canEditStudents && <th className="border border-black px-4 py-2">Action</th>}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="border border-black hover:bg-gray-50">
                    {canEditStudents && (
                      <td className="border border-black px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(student.id)}
                          onChange={() => toggleRowSelection(student.id)}
                        />
                      </td>
                    )}
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
                    {canEditStudents && (
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
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canEditStudents ? "8" : "6"} className="text-center py-4 text-gray-500 italic">
                    {userRole === "instructor" && (!ownedSubjectIds || ownedSubjectIds.length === 0) 
                      ? "No subjects assigned to you." 
                      : "No matching students found."
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Add/Edit Student Modal */}
          {showModal && canEditStudents && (
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
          {showImportModal && canEditStudents && (
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

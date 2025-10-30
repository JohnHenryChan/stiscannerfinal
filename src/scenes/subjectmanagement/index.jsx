import React, { useState, useEffect } from "react";
import { MdSearch } from "react-icons/md";
import { FaTrash, FaPen } from "react-icons/fa";
import { Link } from "react-router-dom";
import SidebarAdmin from "../global/SidebarAdmin";
import TopbarAdmin from "../global/TopbarAdmin";
import Subject from "../../components/Subject";
import ImportExcelModal from "../../components/ImportExcelModal";
import ConfirmModal from "../../components/ConfirmModal";
import { db } from "../../firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  setDoc,
  updateDoc,
  getDocs,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";

const SubjectManagement = () => {
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [isSubjectOpen, setIsSubjectOpen] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [instructors, setInstructors] = useState([]); // NEW: list of instructors
  const [editingData, setEditingData] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState("All Programs");
  const [selectedSY, setSelectedSY] = useState("All School Years");
  const [selectedYearLevel, setSelectedYearLevel] = useState("All Year Levels");
  const [selectedSemester, setSelectedSemester] = useState("All Semesters");
  const [showImportModal, setShowImportModal] = useState(false);

  // Confirm delete modal state
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [subjectToDeleteIndex, setSubjectToDeleteIndex] = useState(null);

  // Confirm-change modal state (for subjectCode changes)
  const [confirmChangeVisible, setConfirmChangeVisible] = useState(false);
  const [pendingChangeData, setPendingChangeData] = useState(null);
  const [pendingOldId, setPendingOldId] = useState(null);

  // 🔹 Fetch subjects from Firestore
  useEffect(() => {
    let unsubscribe;

    const fetchSubjects = async () => {
      if (!user) return;

      // Admin & Registrar: full list + full controls
      if (user.role === "admin" || user.role === "registrar") {
        unsubscribe = onSnapshot(collection(db, "subjectList"), (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            ...doc.data(),
            id: doc.id,
          }));
          setSubjects(data);
        });
        return;
      }

      // Guidance: view-only but see ALL subjects
      if (user.role === "guidance") {
        unsubscribe = onSnapshot(collection(db, "subjectList"), (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            ...doc.data(),
            id: doc.id,
          }));
          setSubjects(data);
        });
        return;
      }

      // Instructor: only subjects listed in their instructor doc (no modify controls)
      try {
        console.log("[SubjectManagement] Looking for instructor with uid:", user.uid);
        console.log("[SubjectManagement] User object:", user);
        
        const instructorsSnap = await getDocs(collection(db, "instructors"));
        console.log("[SubjectManagement] Total instructors found:", instructorsSnap.docs.length);
        
        // Log all instructor documents for debugging
        instructorsSnap.docs.forEach((doc, index) => {
          const data = doc.data();
          console.log(`[SubjectManagement] Instructor ${index}:`, {
            id: doc.id,
            uid: data.uid,
            instructorCode: data.instructorCode,
            name: data.name,
            email: data.email,
            subjectList: data.subjectList
          });
        });
        
        const instructorDoc = instructorsSnap.docs.find((d) => {
          const data = d.data();
          
          // Primary matches (most reliable)
          const uid_match = data?.uid === user.uid;
          const id_match = d.id === user.uid;
          const email_match = data?.email === user.email;
          
          // Secondary matches (only if both values exist and are truthy)
          const instructor_code_match = user.instructorCode && d.id === user.instructorCode;
          const instructor_code_data_match = user.instructorCode && data?.instructorCode && data.instructorCode === user.instructorCode;
          
          const matches = uid_match || id_match || email_match || instructor_code_match || instructor_code_data_match;
          
          console.log(`[SubjectManagement] Checking instructor ${d.id}:`, {
            uid_match,
            id_match,
            email_match,
            instructor_code_match,
            instructor_code_data_match,
            overall_match: matches,
            user_uid: user.uid,
            user_instructorCode: user.instructorCode,
            data_uid: data?.uid,
            data_instructorCode: data?.instructorCode
          });
          
          return matches;
        });

        if (!instructorDoc) {
          console.warn("[SubjectManagement] No instructor document found for user:", user.uid);
          setSubjects([]);
          return;
        }

        const instructorData = instructorDoc.data();
        console.log("[SubjectManagement] Found instructor document:", {
          id: instructorDoc.id,
          data: instructorData
        });
        
        const subjectList = Array.isArray(instructorData.subjectList)
          ? instructorData.subjectList
          : [];

        console.log("[SubjectManagement] Instructor's subject list:", subjectList);

        if (subjectList.length === 0) {
          console.warn("[SubjectManagement] Instructor has empty subject list");
          setSubjects([]);
          return;
        }

        unsubscribe = onSnapshot(collection(db, "subjectList"), (snapshot) => {
          console.log("[SubjectManagement] Total subjects in collection:", snapshot.docs.length);
          
          const filtered = snapshot.docs.filter((doc) => {
            const isIncluded = subjectList.includes(doc.id) || subjectList.includes(doc.data().subjectCode);
            console.log(`[SubjectManagement] Subject ${doc.id} (${doc.data().subjectCode}) included:`, isIncluded);
            return isIncluded;
          }).map((doc) => ({
            ...doc.data(),
            id: doc.id,
          }));
          
          console.log("[SubjectManagement] Filtered subjects for instructor:", filtered);
          setSubjects(filtered);
        });
      } catch (err) {
        console.error("[SubjectManagement] Failed to load instructor subjects:", err);
        setSubjects([]);
      }
    };

    fetchSubjects();
    return () => unsubscribe && unsubscribe();
  }, [user]);

  // 🔹 NEW: Fetch instructors (role = "instructor")
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "instructors"), (snap) => {
      const data = snap.docs
        .map((doc) => ({ ...doc.data(), id: doc.id }))
        .filter((inst) => inst.role === "instructor");
      setInstructors(data);
    });
    return () => unsub();
  }, []);

  // 🔹 Distinct dropdown values
  const distinctPrograms = [
    "All Programs",
    ...new Set(subjects.map((subj) => subj.program)),
  ];
  const distinctSchoolYears = [
    "All School Years",
    ...new Set(
      subjects.map((subj) =>
        subj.schoolYearStart && subj.schoolYearEnd
          ? `${subj.schoolYearStart}-${subj.schoolYearEnd}`
          : "N/A"
      )
    ),
  ];
  const distinctSemesters = ["All Semesters", "1st Semester", "2nd Semester"];
  const distinctYearLevels = [
    "All Year Levels",
    "1st Year",
    "2nd Year",
    "3rd Year",
    "4th Year",
  ];

  // 🔹 CRUD handlers
  const handleOpenSubject = () => {
    setEditingData(null);
    setIsSubjectOpen(true);
  };
  const handleCloseSubject = () => setIsSubjectOpen(false);

  const handleSubjectSubmit = async (data, hasWarning = false) => {
    try {
      const newCode = data.subjectCode;
      if (editingData) {
        const oldId = editingData.id || editingData.subjectCode;

        // if code unchanged -> update existing doc
        if (newCode === oldId) {
          await setDoc(doc(db, "subjectList", oldId), data, { merge: true });
          setIsSubjectOpen(false);
          setEditingData(null);
          return;
        }

        // Duplicate check / blocking warnings are handled inside the Subject modal (so they show
        // in the same UI place). Proceed here assuming the modal already validated duplicates.
 
        // code changed -> if there is a warning, show confirm modal and keep Subject open
        if (hasWarning) {
          setPendingChangeData(data);
          setPendingOldId(oldId);
          setConfirmChangeVisible(true);
          return;
        }
 
        // no warning -> proceed with migration immediately (same logic as performed when user confirms)
        let newDocData = { ...data };
 
        // read old subject doc to copy inline student list fields if present
        try {
          const oldRef = doc(db, "subjectList", oldId);
          const oldSnap = await getDoc(oldRef);
          if (oldSnap.exists()) {
            const oldData = oldSnap.data();
            const studentFields = ["studentList", "students", "studentIds", "studentsList", "students_list"];
            for (const k of studentFields) {
              if (Array.isArray(oldData[k]) && oldData[k].length > 0) {
                if (Array.isArray(newDocData[k]) && newDocData[k].length > 0) {
                  const merged = Array.from(new Set([...(newDocData[k] || []), ...oldData[k]]));
                  newDocData[k] = merged;
                } else {
                  newDocData[k] = oldData[k];
                }
                break;
              }
            }
          }
        } catch (err) {
          console.warn("Failed to read old subject doc for field-based student-list migration:", err);
        }

        // create new subject doc (merge in migrated inline list if any)
        await setDoc(doc(db, "subjectList", newCode), newDocData, { merge: true });

        // migrate student subcollections
        try {
          const subcollectionsToTry = ["studentList", "students"];
          for (const subName of subcollectionsToTry) {
            const oldColRef = collection(db, "subjectList", oldId, subName);
            const studentsSnap = await getDocs(oldColRef);
            if (studentsSnap.empty) continue;

            const docs = studentsSnap.docs;
            const chunkSize = 500;
            for (let i = 0; i < docs.length; i += chunkSize) {
              const batch = writeBatch(db);
              const chunk = docs.slice(i, i + chunkSize);
              chunk.forEach((sd) => {
                const data = sd.data();
                const newDocRef = doc(db, "subjectList", newCode, subName, sd.id);
                const oldDocRef = doc(db, "subjectList", oldId, subName, sd.id);
                batch.set(newDocRef, data);
                batch.delete(oldDocRef);
              });
              await batch.commit();
            }
          }
        } catch (err) {
          console.warn("Failed to migrate student subcollection(s):", err);
        }

        // migrate instructor references (replace oldId with newCode)
        try {
          const instructorsSnap = await getDocs(collection(db, "instructors"));
          const updates = [];
          instructorsSnap.forEach((instDoc) => {
            const inst = instDoc.data();
            const subjectList = Array.isArray(inst.subjectList) ? inst.subjectList : [];
            if (subjectList.includes(oldId)) {
              const updated = subjectList.map((sid) => (sid === oldId ? newCode : sid));
              updates.push(updateDoc(doc(db, "instructors", instDoc.id), { subjectList: updated }));
            }
          });
          await Promise.all(updates);
        } catch (err) {
          console.warn("Failed to migrate instructor references:", err);
        }

        // delete old subject doc
        try {
          await deleteDoc(doc(db, "subjectList", oldId));
        } catch (err) {
          console.warn("Failed to delete old subject doc:", err);
        }

        setIsSubjectOpen(false);
        setEditingData(null);
        return;
      }

      // create new subject (not editing)
      const subjectID = data.subjectCode;
      await setDoc(doc(db, "subjectList", subjectID), data, { merge: true });
      setIsSubjectOpen(false);
      setEditingData(null);
    } catch (err) {
      console.error("handleSubjectSubmit error:", err);
      alert("Failed to save subject. See console for details.");
    }
  };

  // called when user confirms change in ConfirmModal
  const performCodeChange = async () => {
    if (!pendingChangeData || !pendingOldId) {
      setConfirmChangeVisible(false);
      setPendingChangeData(null);
      setPendingOldId(null);
      return;
    }

    const newCode = pendingChangeData.subjectCode;
    const oldId = pendingOldId;

    try {
      // reuse migration logic from handleSubjectSubmit (field copy + subcollection batches + instructor refs)
      let newDocData = { ...pendingChangeData };

      try {
        const oldRef = doc(db, "subjectList", oldId);
        const oldSnap = await getDoc(oldRef);
        if (oldSnap.exists()) {
          const oldData = oldSnap.data();
          const studentFields = ["studentList", "students", "studentIds", "studentsList", "students_list"];
          for (const k of studentFields) {
            if (Array.isArray(oldData[k]) && oldData[k].length > 0) {
              if (Array.isArray(newDocData[k]) && newDocData[k].length > 0) {
                const merged = Array.from(new Set([...(newDocData[k] || []), ...oldData[k]]));
                newDocData[k] = merged;
              } else {
                newDocData[k] = oldData[k];
              }
              break;
            }
          }
        }
      } catch (err) {
        console.warn("Failed to read old subject doc for field-based student-list migration:", err);
      }

      await setDoc(doc(db, "subjectList", newCode), newDocData, { merge: true });

      // migrate student subcollections
      try {
        const subcollectionsToTry = ["studentList", "students"];
        for (const subName of subcollectionsToTry) {
          const oldColRef = collection(db, "subjectList", oldId, subName);
          const studentsSnap = await getDocs(oldColRef);
          if (studentsSnap.empty) continue;

          const docs = studentsSnap.docs;
          const chunkSize = 500;
          for (let i = 0; i < docs.length; i += chunkSize) {
            const batch = writeBatch(db);
            const chunk = docs.slice(i, i + chunkSize);
            chunk.forEach((sd) => {
              const data = sd.data();
              const newDocRef = doc(db, "subjectList", newCode, subName, sd.id);
              const oldDocRef = doc(db, "subjectList", oldId, subName, sd.id);
              batch.set(newDocRef, data);
              batch.delete(oldDocRef);
            });
            await batch.commit();
          }
        }
      } catch (err) {
        console.warn("Failed to migrate student subcollection(s):", err);
      }

      // migrate instructor references
      try {
        const instructorsSnap = await getDocs(collection(db, "instructors"));
        const updates = [];
        instructorsSnap.forEach((instDoc) => {
          const inst = instDoc.data();
          const subjectList = Array.isArray(inst.subjectList) ? inst.subjectList : [];
          if (subjectList.includes(oldId)) {
            const updated = subjectList.map((sid) => (sid === oldId ? newCode : sid));
            updates.push(updateDoc(doc(db, "instructors", instDoc.id), { subjectList: updated }));
          }
        });
        await Promise.all(updates);
      } catch (err) {
        console.warn("Failed to migrate instructor references:", err);
      }

      // delete old subject doc
      try {
        await deleteDoc(doc(db, "subjectList", oldId));
      } catch (err) {
        console.warn("Failed to delete old subject doc:", err);
      }

      setIsSubjectOpen(false);
      setEditingData(null);
    } catch (err) {
      console.error("performCodeChange error:", err);
      alert("Failed to change subject code. See console.");
    } finally {
      setConfirmChangeVisible(false);
      setPendingChangeData(null);
      setPendingOldId(null);
    }
  };

  const cancelCodeChange = () => {
    setConfirmChangeVisible(false);
    setPendingChangeData(null);
    setPendingOldId(null);
  };

  const handleEdit = (index) => {
    setEditingData(subjects[index]);
    setIsSubjectOpen(true);
  };

  // open confirm modal instead of deleting immediately
  const handleDelete = (index) => {
    setSubjectToDeleteIndex(index);
    setConfirmVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (subjectToDeleteIndex === null) {
      setConfirmVisible(false);
      return;
    }
    const subjectDelete = subjects[subjectToDeleteIndex];
    if (subjectDelete?.id) {
      await deleteDoc(doc(db, "subjectList", subjectDelete.id));
    }
    setSubjectToDeleteIndex(null);
    setConfirmVisible(false);
  };

  const handleCancelDelete = () => {
    setSubjectToDeleteIndex(null);
    setConfirmVisible(false);
  };

  const toggleStatus = async (subj) => {
    await updateDoc(doc(db, "subjectList", subj.id), {
      active: !subj.active,
    });
  };

  // 🔹 NEW: Handle instructor assignment change
  const handleInstructorChange = async (subjectId, newInstructorId) => {
    try {
      const oldInstructorId = subjects.find(s => s.id === subjectId)?.assignedInstructor;

      // Update the subject document with the new assigned instructor
      await updateDoc(doc(db, "subjectList", subjectId), {
        assignedInstructor: newInstructorId || null,
      });

      // Remove subjectId from old instructor's subjectList array (if exists)
      if (oldInstructorId) {
        const oldInstRef = doc(db, "instructors", oldInstructorId);
        const oldInstSnap = await getDoc(oldInstRef);
        if (oldInstSnap.exists()) {
          const oldSubjectList = oldInstSnap.data().subjectList || [];
          const updated = oldSubjectList.filter(code => code !== subjectId);
          await updateDoc(oldInstRef, { subjectList: updated });
        }
      }

      // Add subjectId to new instructor's subjectList array
      if (newInstructorId) {
        const newInstRef = doc(db, "instructors", newInstructorId);
        const newInstSnap = await getDoc(newInstRef);
        if (newInstSnap.exists()) {
          const currentSubjectList = newInstSnap.data().subjectList || [];
          if (!currentSubjectList.includes(subjectId)) {
            await updateDoc(newInstRef, {
              subjectList: [...currentSubjectList, subjectId]
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to update assigned instructor:", err);
    }
  };

  // 🔹 Filtering
  const filteredSubjects = subjects.filter((subj) => {
    const programMatch =
      selectedProgram === "All Programs" || subj.program === selectedProgram;
    const syFormatted =
      subj.schoolYearStart && subj.schoolYearEnd
        ? `${subj.schoolYearStart}-${subj.schoolYearEnd}`
        : "N/A";
    const syMatch =
      selectedSY === "All School Years" || syFormatted === selectedSY;
    const semesterMatch =
      selectedSemester === "All Semesters" || subj.semester === selectedSemester;
    const yearLevelMatch =
      selectedYearLevel === "All Year Levels" ||
      subj.yearLevel === selectedYearLevel;
    const searchMatch = Object.values(subj)
      .filter((val) => typeof val === "string")
      .some((val) => val.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
      programMatch && syMatch && semesterMatch && yearLevelMatch && searchMatch
    );
  });

  return (
    <div className="flex flex-col min-h-screen">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />
        <div className="flex flex-col flex-grow px-8 py-6 bg-white">
          <h1 className="text-2xl font-semibold mb-4">Subject Management</h1>

          {/* 🔹 Search + Filters + Buttons */}
          <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
            <div className="flex items-center gap-4 flex-wrap">
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

              <select
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                className="border px-4 py-2 rounded-md shadow-md bg-white text-gray-700"
              >
                {distinctPrograms.map((prog, idx) => (
                  <option key={idx} value={prog}>
                    {prog}
                  </option>
                ))}
              </select>

              <select
                value={selectedSY}
                onChange={(e) => setSelectedSY(e.target.value)}
                className="border px-4 py-2 rounded-md shadow-md bg-white text-gray-700"
              >
                {distinctSchoolYears.map((sy, idx) => (
                  <option key={idx} value={sy}>
                    {sy}
                  </option>
                ))}
              </select>

              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="border px-4 py-2 rounded-md shadow-md bg-white text-gray-700"
              >
                {distinctSemesters.map((sem, idx) => (
                  <option key={idx} value={sem}>
                    {sem}
                  </option>
                ))}
              </select>

              <select
                value={selectedYearLevel}
                onChange={(e) => setSelectedYearLevel(e.target.value)}
                className="border px-4 py-2 rounded-md shadow-md bg-white text-gray-700"
              >
                {distinctYearLevels.map((level, idx) => (
                  <option key={idx} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            {/* 🔹 Action buttons */}
            <div className="flex gap-3">
              {(user?.role === "admin" || user?.role === "registrar") && (
                <>
                  <button
                    onClick={handleOpenSubject}
                    className="bg-[#0057A4] text-white px-6 py-2 rounded-sm shadow hover:bg-blue-800 transition-all"
                  >
                    Add Subject
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="bg-green-600 text-white px-6 py-2 rounded-sm shadow hover:bg-green-700 transition-all"
                  >
                    Import Excel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 🔹 Table */}
          <div className="overflow-x-auto shadow rounded-lg">
            <table className="min-w-full table-auto border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-4 border">Program</th>
                  <th className="py-2 px-4 border">Subject</th>
                  <th className="py-2 px-4 border">Subject Code</th>
                  <th className="py-2 px-4 border">Year Level</th>
                  <th className="py-2 px-4 border">School Year</th>
                  <th className="py-2 px-4 border">Semester</th>
                  {user?.role !== "instructor" && (
                    <th className="py-2 px-4 border">Assigned Instructor</th>
                  )}
                  {(user?.role === "admin" || user?.role === "registrar") && (
                    <>
                      <th className="py-2 px-4 border">Status</th>
                      <th className="py-2 px-4 border">Action</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {filteredSubjects.length > 0 ? (
                  filteredSubjects.map((subj, index) => {
                    const assignedInst = instructors.find((inst) => inst.id === subj.assignedInstructor);
                    return (
                      <tr key={index} className="text-center">
                        <td className="py-2 px-4 border">{subj.program}</td>
                        <td className="py-2 px-4 border">
                          <Link
                            to={`/admin/subjects/${subj.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {subj.subject}
                          </Link>
                        </td>
                        <td className="py-2 px-4 border">{subj.subjectCode}</td>
                        <td className="py-2 px-4 border">{subj.yearLevel}</td>
                        <td className="py-2 px-4 border">
                          {subj.schoolYearStart}-{subj.schoolYearEnd}
                        </td>
                        <td className="py-2 px-4 border">
                          {subj.semester || "—"}
                        </td>
                        {user?.role !== "instructor" && (
                          <td className="py-2 px-4 border">
                            {(user?.role === "admin" || user?.role === "registrar") ? (
                              <select
                                value={subj.assignedInstructor || ""}
                                onChange={(e) => handleInstructorChange(subj.id, e.target.value)}
                                className="border px-2 py-1 rounded text-sm"
                              >
                                <option value="">None</option>
                                {instructors.map((inst) => (
                                  <option key={inst.id} value={inst.id}>
                                    {inst.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-gray-700">
                                {instructors.find((inst) => inst.id === subj.assignedInstructor)?.name || "None"}
                              </span>
                            )}
                          </td>
                        )}

                        {(user?.role === "admin" || user?.role === "registrar") && (
                          <>
                            <td className="py-2 px-4 border">
                              <button
                                className={`px-3 py-1 rounded text-sm font-medium ${
                                  subj.active
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                                onClick={() => toggleStatus(subj)}
                              >
                                {subj.active ? "Active" : "Inactive"}
                              </button>
                            </td>
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
                          </>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={
                        user?.role === "instructor" 
                          ? 6 
                          : (user?.role === "admin" || user?.role === "registrar") 
                            ? 9 
                            : 7
                      }
                      className="py-4 text-center text-gray-500 italic"
                    >
                      No subjects found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 🔹 Modals */}
          <Subject
            visible={isSubjectOpen}
            onClose={handleCloseSubject}
            onSubmit={handleSubjectSubmit}
            initialData={editingData}
          />

          <ImportExcelModal
            visible={showImportModal}
            onClose={() => setShowImportModal(false)}
          />

          <ConfirmModal
            visible={confirmVisible}
            title="Subject Delete"
            message="Are you sure you want to delete this subject? No students will be erased from the masterlist, but all other related subject data will be deleted."
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
          />

          {/* Confirm modal for subject-code-change */}
          <ConfirmModal
            visible={confirmChangeVisible}
            title="Change Subject Code?"
            message={
              <div>
                <div>This will create a new subject record with the new code and remove the old record.</div>
                <div className="mt-2 text-sm">Instructors' references will be updated and student subcollections will be migrated, but some related data may not be migrated automatically.</div>
                <div className="mt-2 font-medium">New Code: {pendingChangeData?.subjectCode}</div>
                <div>Old Code: {pendingOldId}</div>
              </div>
            }
            onConfirm={performCodeChange}
            onCancel={cancelCodeChange}
            confirmLabel="Proceed"
            cancelLabel="Cancel"
            confirmClass="bg-red-600 text-white hover:bg-red-700"
            cancelClass="bg-gray-200 hover:bg-gray-300"
          />
        </div>
      </div>
    </div>
  );
};

export default SubjectManagement;

import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  updateDoc
} from "firebase/firestore";
import { FaPen, FaTrash, FaSave } from "react-icons/fa";
import { db } from "../../firebaseConfig";
import AddStudent from "../../components/AddStudent";
import ConfirmationModal from "../../components/ConfirmationModal";
import { useAuth } from "../../context/AuthContext";
import TopbarAdmin from "../global/TopbarAdmin";
import SidebarAdmin from "../global/SidebarAdmin";


// school year range 2020..2035
const YEARS = Array.from({ length: 16 }, (_, i) => String(2020 + i));

const ClassList = () => {
  const { subjectId } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();

  const [subjectData, setSubjectData] = useState(null);
  const [editingSubjectData, setEditingSubjectData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [originalSnapshot, setOriginalSnapshot] = useState(null);
  const [inlineError, setInlineError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [students, setStudents] = useState([]);
  const [assignedInstructors, setAssignedInstructors] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const startRef = useRef(null);
  const endRef = useRef(null);

  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });


  useEffect(() => {
    const subjectRef = doc(db, "subjectList", subjectId);

    const unsubscribeStudents = onSnapshot(collection(subjectRef, "students"), async (snapshot) => {
      const studentIds = snapshot.docs.map((doc) => doc.id);
      const studentPromises = studentIds.map(async (studentId) => {
        const studentSnap = await getDoc(doc(db, "students", studentId));
        if (studentSnap.exists()) {
          const data = studentSnap.data();
          return {
            id: studentId,
            ...data,
            name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
            valid: true
          };
        } else {
          return { id: studentId, name: "Invalid Reference", valid: false };
        }
      });
      const studentData = await Promise.all(studentPromises);
      setStudents(studentData);
    });

    getDoc(subjectRef)
      .then((subjectSnap) => {
        if (subjectSnap.exists()) {
          const data = subjectSnap.data();
          setSubjectData(data);
          setEditingSubjectData(data);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching subject:", error);
        setLoading(false);
      });

    const unsubscribeInstructors = onSnapshot(collection(db, "instructors"), (snapshot) => {
      const filtered = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((inst) => inst.subjectList?.includes(subjectId));
      setAssignedInstructors(filtered);
    });

    return () => {
      unsubscribeStudents();
      unsubscribeInstructors();
    };
  }, [subjectId]);

  useEffect(() => {
    const fetchMasterStudents = async () => {
      const snap = await getDocs(collection(db, "students"));
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllStudents(data);
    };
    fetchMasterStudents();
  }, []);

  const handleBack = () => navigate("/subjectmanagement");

  const handleAddOrUpdateStudent = (studentData) => {
    const isMasterStudent = allStudents.some((s) => s.id === studentData.id);

    if (role !== "admin" && !isMasterStudent) {
      setModalConfig({
        isOpen: true,
        title: "Unauthorized Student ID",
        message: `You can only add students who already exist in the master list.`,
        onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
      });
      return;
    }

    // Add student to subject subcollection
    const name = `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim();
    const newStudentData = { ...studentData, name, valid: true };

    setStudents((prev) => {
      const exists = prev.some((s) => s.id === studentData.id);
      return exists
        ? prev.map((s) => (s.id === studentData.id ? newStudentData : s))
        : [...prev, newStudentData];
    });

    setShowModal(false);
    setEditingStudent(null);
  };
  ;


  const handleEditStudent = (studentId) => {
    const student = students.find((s) => s.id === studentId);
    if (student?.valid) {
      setEditingStudent(student);
      setShowModal(true);
    } else {
      alert("This student reference is invalid and cannot be edited.");
    }
  };

  const handleDeleteStudentFromSubject = (studentId) => {
    setModalConfig({
      isOpen: true,
      title: "Remove Student from Subject",
      message: "Are you sure you want to remove this student from the subject list?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "subjectList", subjectId, "students", studentId));
        } catch (err) {
          console.error("Error removing student from subject:", err);
        } finally {
          setModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleDeleteStudentFromMaster = (studentId) => {
    setModalConfig({
      isOpen: true,
      title: "Delete Student from Master List",
      message: "Are you sure you want to delete this student from the master list? This action is irreversible.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "students", studentId));
          await deleteDoc(doc(db, "subjectList", subjectId, "students", studentId));
        } catch (err) {
          console.error("Error deleting student from master:", err);
        } finally {
          setModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleEditToggle = () => {
    if (!subjectData) return;
    setOriginalSnapshot({ ...subjectData });
    setEditingSubjectData({ ...subjectData });
    setInlineError("");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (originalSnapshot) {
      setEditingSubjectData({ ...originalSnapshot });
    } else if (subjectData) {
      setEditingSubjectData({ ...subjectData });
    }
    setInlineError("");
    setOriginalSnapshot(null);
    setIsEditing(false);
  };

  const handleSaveSubject = async () => {
    setInlineError("");
    const validation = validateEditingSubject(editingSubjectData);
    if (!validation.ok) {
      setInlineError(validation.error);
      return;
    }

    const oldId = subjectData?.subjectCode || subjectId;
    const newCode = editingSubjectData.subjectCode;
    const codeChanged = Boolean(newCode && oldId && newCode !== oldId);

    try {
      // duplicate check (blocking)
      if (codeChanged) {
        const targetRef = doc(db, "subjectList", newCode);
        const targetSnap = await getDoc(targetRef);
        if (targetSnap.exists()) {
          setInlineError("A subject with that code already exists. Please pick a different code or edit the existing subject.");
          return;
        }
      }

      // format warning (non-blocking) -> confirm
      if (validation.warning && !codeChanged) {
        return setModalConfig({
          isOpen: true,
          title: "Non-standard Subject Code",
          message: "Subject Code does not follow the standard format. Proceed anyway?",
          onConfirm: async () => {
            try {
              await updateDoc(doc(db, "subjectList", oldId), editingSubjectData);
              setSubjectData({ ...editingSubjectData });
              setIsEditing(false);
              setOriginalSnapshot(null);
              setInlineError("");
            } catch (err) {
              console.error(err);
              setInlineError("Failed to save subject. See console.");
            } finally {
              setModalConfig((prev) => ({ ...prev, isOpen: false }));
            }
          },
          onCancel: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
        });
      }

      // code changed -> confirm then migrate (create new, copy students, delete old)
      if (codeChanged) {
        return setModalConfig({
          isOpen: true,
          title: "Confirm Subject Code Change",
          message:
            "Changing the Subject Code will create a new subject record and migrate related data (students). Proceed?",
          onConfirm: async () => {
            try {
              const payload = { ...editingSubjectData };
              const newRef = doc(db, "subjectList", newCode);
              await setDoc(newRef, payload);

              // copy student subcollections if present
              const subNames = ["students", "studentList"];
              for (const name of subNames) {
                try {
                  const oldCol = collection(db, "subjectList", oldId, name);
                  const docs = await getDocs(oldCol);
                  for (const d of docs.docs) {
                    await setDoc(doc(db, "subjectList", newCode, name, d.id), d.data());
                    await deleteDoc(doc(db, "subjectList", oldId, name, d.id));
                  }
                } catch (err) {
                  // ignore missing subcollection
                }
              }

              // delete old subject doc
              try {
                await deleteDoc(doc(db, "subjectList", oldId));
              } catch (err) {
                console.warn("Failed to delete old subject doc after migration:", err);
              }

              setSubjectData({ ...payload });
              setEditingSubjectData({ ...payload });
              setIsEditing(false);
              setOriginalSnapshot(null);
              navigate(`/admin/subjects/${newCode}`);
            } catch (err) {
              console.error("Failed to change subject code:", err);
              setInlineError("Failed to change subject code. See console.");
            } finally {
              setModalConfig((prev) => ({ ...prev, isOpen: false }));
            }
          },
          onCancel: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
        });
      }

      // no warnings & no code change -> confirm save
      setModalConfig({
        isOpen: true,
        title: "Confirm Save",
        message: "Are you sure you want to save changes to this subject?",
        onConfirm: async () => {
          try {
            await updateDoc(doc(db, "subjectList", oldId), editingSubjectData);
            setSubjectData({ ...editingSubjectData });
            setIsEditing(false);
            setOriginalSnapshot(null);
            setInlineError("");
          } catch (err) {
            console.error(err);
            setInlineError("Failed to save subject. See console.");
          } finally {
            setModalConfig((prev) => ({ ...prev, isOpen: false }));
          }
        },
        onCancel: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
      });
    } catch (err) {
      console.error(err);
      setInlineError("Failed to save subject. See console.");
    }
  };

  const validateEditingSubject = (data) => {
    if (!data) return { ok: false, error: "No data." };
    const {
      program,
      subject,
      subjectCode,
      yearLevel,
      startTime,
      endTime,
      schoolYearStart,
      schoolYearEnd,
      semester,
    } = data;

    if (!program || !subject || !subjectCode || !yearLevel || !semester) {
      return { ok: false, error: "Please fill in all required fields (Program, Subject, Code, Year, Semester)." };
    }

    const leadingLettersMatch = (subjectCode || "").match(/^[A-Za-z]*/);
    const leadingLetters = leadingLettersMatch ? leadingLettersMatch[0] : "";
    if (leadingLetters.length < 4) {
      return { ok: false, error: "Invalid Subject Code format (need at least 4 leading letters)." };
    }
    const altMatch = (subjectCode || "").match(/^([A-Za-z]+)(\d{4})([A-Za-z0-9]*)$/);
    if (!altMatch) {
      return { ok: false, error: "Invalid Subject Code format (must have 4 digits after letters)." };
    }

    const strictStandard = /^[A-Za-z]{4}\d{4}$/;
    const formatWarning = !strictStandard.test(subjectCode);

    if ((schoolYearStart && !schoolYearEnd) || (!schoolYearStart && schoolYearEnd)) {
      return { ok: false, error: "Please provide both Start Year and End Year, or leave both empty." };
    }
    if (schoolYearStart && schoolYearEnd) {
      if (!/^[0-9]{4}$/.test(schoolYearStart) || !/^[0-9]{4}$/.test(schoolYearEnd)) {
        return { ok: false, error: "School years must be 4-digit numbers (e.g. 2024)." };
      }
      const s = parseInt(schoolYearStart, 10);
      const e = parseInt(schoolYearEnd, 10);
      if (s >= e) return { ok: false, error: "Start Year must be earlier than End Year." };
      if (e !== s + 1) return { ok: false, error: "End Year must be exactly Start Year + 1." };
      if (s < 2020 || e > 2035) return { ok: false, error: "School years must be within 2020 - 2035." };
    }

    if ((startTime && !endTime) || (!startTime && endTime)) {
      return { ok: false, error: "Please provide both start time and end time, or leave both empty." };
    }
    if (startTime && endTime) {
      const toMinutes = (t) => {
        const [hh, mm] = t.split(":").map((n) => parseInt(n || "0", 10));
        return hh * 60 + mm;
      };
      const startMin = toMinutes(startTime);
      const endMin = toMinutes(endTime);
      const earliest = 7 * 60;
      const latest = 18 * 60;
      if (!(startMin >= earliest && startMin <= latest && endMin >= earliest && endMin <= latest)) {
        return { ok: false, error: "Start and end times must be between 07:00 and 18:00." };
      }
      if (startMin >= endMin) return { ok: false, error: "Start time must be before end time." };
      if (endMin - startMin > 180) return { ok: false, error: "Duration cannot exceed 3 hours." };
    }

    return { ok: true, error: "", warning: formatWarning };
  };

  const filteredStudents = students.filter((student) =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.id.includes(searchQuery)
  );

  // build rows separately to avoid nested ternary/JSX parse issues
  const studentRows = filteredStudents.length > 0
    ? filteredStudents.map((student) => (
        <tr key={student.id} className={`text-center ${!student.valid ? "bg-red-100" : ""}`}>
          <td className="py-2 px-4 border">{student.id}</td>
          <td className="py-2 px-4 border">
            {student.valid ? (
              <Link to={`/students/${student.id}`} className="text-blue hover:underline">
                {student.name || student.fullName || student.studentName}
              </Link>
            ) : (
              <span className="text-red-500 italic">{student.name || student.fullName || student.studentName}</span>
            )}
          </td>
          <td className="py-2 px-4 border">
            <div className="flex justify-center gap-4">
              <button onClick={() => handleEditStudent(student.id)} disabled={!student.valid}>
                <FaPen className={`cursor-pointer ${student.valid ? "text-black hover:text-blue-600" : "text-gray-400 cursor-not-allowed"}`} />
              </button>
              <button onClick={() => handleDeleteStudentFromSubject(student.id)}>
                <FaTrash className="text-yellow-600 hover:text-yellow-800 cursor-pointer" title="Remove from Subject" />
              </button>
              <button onClick={() => handleDeleteStudentFromMaster(student.id)}>
                <FaTrash className="text-red-600 hover:text-red-800 cursor-pointer" title="Delete from Master List" />
              </button>
            </div>
          </td>
        </tr>
      ))
    : [
        <tr key="no-students">
          <td colSpan={3} className="py-4 border text-center text-gray-500 italic">
            No students found.
          </td>
        </tr>,
      ];

  return (
    <div className="min-h-screen bg-white">
      <TopbarAdmin />
      <div className="flex">
        <SidebarAdmin />

        <main className="flex-1 p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-4">
              <button className="text-2xl font-bold text-blue-700" onClick={handleBack}>←</button>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-700">
                  {subjectData ? (subjectData.subject ? (subjectData.subject[0] || "?") : (subjectData.subjectCode?.[0] || "?")) : "?"}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{subjectData ? (subjectData.subject || subjectData.subjectCode) : "Class List"}</h1>
                  <div className="text-sm text-gray-600">Subject: {subjectData?.subjectCode || subjectId}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 w-64"
              />
              <button
                className="ml-2 border px-3 py-2 rounded bg-gray-50"
                onClick={() => { setShowModal(false); setEditingStudent(null); }}
                title="Reset"
              >
                Clear
              </button>
            </div>
          </div>

          <section className="bg-gray-100 p-4 rounded-lg shadow mb-6">
            {loading ? (
              <p className="text-gray-500">Loading subject data...</p>
            ) : subjectData ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-black">
                <div>
                  {isEditing ? (
                    <>
                      <div className="mb-2">
                        <label className="block text-sm font-medium">Program</label>
                        <input
                          type="text"
                          maxLength={4}
                          value={editingSubjectData?.program || ""}
                          onChange={(e) =>
                            setEditingSubjectData((p) => ({
                              ...p,
                              program: e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase(),
                            }))
                          }
                          className="w-full border p-2 rounded"
                        />
                      </div>
                      <div className="mb-2">
                        <label className="block text-sm font-medium">Subject</label>
                        <input
                          type="text"
                          value={editingSubjectData?.subject || ""}
                          onChange={(e) => setEditingSubjectData((p) => ({ ...p, subject: e.target.value }))}
                          className="w-full border p-2 rounded"
                        />
                      </div>
                      <div className="mb-2">
                        <label className="block text-sm font-medium">Subject Code</label>
                        <input
                          type="text"
                          value={editingSubjectData?.subjectCode || ""}
                          onChange={(e) =>
                            setEditingSubjectData((p) => ({
                              ...p,
                              subjectCode: e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 12).replace(/[a-z]/g, (c) => c.toUpperCase()),
                            }))
                          }
                          className="w-full border p-2 rounded"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div><strong>Program:</strong> {subjectData.program}</div>
                      <div><strong>Subject:</strong> {subjectData.subject}</div>
                      <div><strong>Subject Code:</strong> {subjectData.subjectCode}</div>
                    </>
                  )}
                </div>

                <div>
                  {isEditing ? (
                    <>
                      <div className="mb-2">
                        <label className="block text-sm font-medium">Year Level</label>
                        <select
                          value={editingSubjectData?.yearLevel || ""}
                          onChange={(e) => setEditingSubjectData((p) => ({ ...p, yearLevel: e.target.value }))}
                          className="w-full border p-2 rounded"
                        >
                          <option value="">Select Year Level</option>
                          <option value="1st Year">1st Year</option>
                          <option value="2nd Year">2nd Year</option>
                          <option value="3rd Year">3rd Year</option>
                          <option value="4th Year">4th Year</option>
                        </select>
                      </div>

                      <div className="mb-2">
                        <label className="block text-sm font-medium">Semester</label>
                        <select
                          value={editingSubjectData?.semester || ""}
                          onChange={(e) => setEditingSubjectData((p) => ({ ...p, semester: e.target.value }))}
                          className="w-full border p-2 rounded"
                        >
                          <option value="">Select Semester</option>
                          <option value="1st Semester">1st Semester</option>
                          <option value="2nd Semester">2nd Semester</option>
                        </select>
                      </div>

                      <div className="mb-2">
                        <label className="block text-sm font-medium">Time</label>
                        <div className="flex gap-2">
                          <input
                            type="time"
                            min="07:00"
                            max="18:00"
                            value={editingSubjectData?.startTime || ""}
                            onChange={(e) => setEditingSubjectData((p) => ({ ...p, startTime: e.target.value }))}
                            className="w-1/2 border p-2 rounded"
                          />
                          <input
                            type="time"
                            min="07:00"
                            max="18:00"
                            value={editingSubjectData?.endTime || ""}
                            onChange={(e) => setEditingSubjectData((p) => ({ ...p, endTime: e.target.value }))}
                            className="w-1/2 border p-2 rounded"
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Times must be between 07:00 and 18:00; duration ≤ 3 hours.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div><strong>Year Level:</strong> {subjectData.yearLevel}</div>
                      <div><strong>Semester:</strong> {subjectData.semester}</div>
                      <div><strong>Time:</strong> {subjectData.startTime} - {subjectData.endTime}</div>
                    </>
                  )}
                </div>

                <div className="text-right">
                  {isEditing ? (
                    <>
                      <div className="mb-2">
                        <label className="block text-sm font-medium">School Year</label>
                        <div className="flex gap-2">
                          <div className="w-1/2" ref={startRef}>
                            <button
                              type="button"
                              onClick={() => { setStartOpen((s) => !s); setEndOpen(false); }}
                              className="w-full text-left border rounded p-2 bg-white"
                            >
                              {editingSubjectData?.schoolYearStart || "—"}
                            </button>
                            {startOpen && (
                              <div className="absolute left-0 right-0 mt-2 bg-white border rounded shadow max-h-40 overflow-y-auto z-50">
                                {YEARS.map((y) => (
                                  <button
                                    key={y}
                                    type="button"
                                    onClick={() => {
                                      const s = Math.max(2020, Math.min(2035, Number(y)));
                                      const e = Math.min(2035, s + 1);
                                      setEditingSubjectData((p) => ({ ...p, schoolYearStart: String(s), schoolYearEnd: String(e) }));
                                      setStartOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-100"
                                  >
                                    {y}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="w-1/2" ref={endRef}>
                            <button
                              type="button"
                              onClick={() => { setEndOpen((s) => !s); setStartOpen(false); }}
                              className="w-full text-left border rounded p-2 bg-white"
                            >
                              {editingSubjectData?.schoolYearEnd || "—"}
                            </button>
                            {endOpen && (
                              <div className="absolute left-0 right-0 mt-2 bg-white border rounded shadow max-h-40 overflow-y-auto z-50">
                                {YEARS.map((y) => (
                                  <button
                                    key={y}
                                    type="button"
                                    onClick={() => {
                                      const e = Math.max(2020, Math.min(2035, Number(y)));
                                      const s = Math.max(2020, e - 1);
                                      setEditingSubjectData((p) => ({ ...p, schoolYearStart: String(s), schoolYearEnd: String(e) }));
                                      setEndOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-100"
                                  >
                                    {y}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={handleSaveSubject} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                          <FaSave className="inline mr-2" /> Save
                        </button>
                        <button onClick={handleCancelEdit} className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
                          Cancel
                        </button>
                      </div>
                      {inlineError && <p className="text-red-600 text-sm mt-2">{inlineError}</p>}
                    </>
                  ) : (
                    <>
                      <div><strong>School Year:</strong> {subjectData.schoolYearStart} - {subjectData.schoolYearEnd}</div>
                      <div className="mt-2"><strong>Instructor{assignedInstructors.length !== 1 ? "s" : ""}:</strong> {assignedInstructors.length > 0 ? assignedInstructors.map((i) => i.name || i.instructorName || i.id).join(", ") : "None assigned"}</div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={handleEditToggle} className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-800">
                          <FaPen className="inline mr-2" /> Edit
                        </button>
                        <button
                          className="bg-blue-700 text-white font-medium px-6 py-2 rounded-md hover:bg-blue-800"
                          onClick={() => setShowModal(true)}
                        >
                          Add Student
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-red-500">Subject not found.</p>
            )}
          </section>

          <section className="bg-white shadow rounded-lg overflow-x-auto">
            <table className="min-w-full table-auto border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-4 border">Student ID</th>
                  <th className="py-2 px-4 border">Full Name</th>
                  <th className="py-2 px-4 border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {studentRows}
               </tbody>
            </table>
          </section>

          {showModal && (
            <AddStudent
              onClose={() => {
                setShowModal(false);
                setEditingStudent(null);
              }}
              onAdd={handleAddOrUpdateStudent}
              initialData={editingStudent}
              subjectID={subjectId}
              validStudentIDs={allStudents.map(s => s.id)}
              role={role}
            />
          )}

          <ConfirmationModal
            isOpen={modalConfig.isOpen}
            title={modalConfig.title}
            message={modalConfig.message}
            onCancel={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
            onConfirm={modalConfig.onConfirm}
          />
        </main>
      </div>
    </div>
  );
};

export default ClassList;

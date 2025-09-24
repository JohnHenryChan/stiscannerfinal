import React, { useEffect, useState } from "react";
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

const ClassList = () => {
  const { subjectId } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();

  const [subjectData, setSubjectData] = useState(null);
  const [editingSubjectData, setEditingSubjectData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [students, setStudents] = useState([]);
  const [assignedInstructors, setAssignedInstructors] = useState([]);
  const [allStudents, setAllStudents] = useState([]);

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

  const handleEditToggle = () => setIsEditing(true);

  const handleSaveSubject = async () => {
    const { program, subject, subjectCode, yearLevel, startTime, endTime } = editingSubjectData;

    if (!program || !subject || !subjectCode || !yearLevel || !startTime || !endTime) {
      return setModalConfig({
        isOpen: true,
        title: "Missing Fields",
        message: "Please fill in all required fields before saving.",
        onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
        onCancel: () => setModalConfig((prev) => ({ ...prev, isOpen: false })), // ✅ Add this
      });
    }
    const isCodeChanged = subjectCode !== subjectData.subjectCode;

    if (isCodeChanged) {
      const snapshot = await getDocs(collection(db, "subjectList"));
      const duplicate = snapshot.docs.some((doc) => doc.id === subjectCode);

      if (duplicate) {
        return setModalConfig({
          isOpen: true,
          title: "Duplicate Subject Code",
          message: "A subject with this code already exists. Please choose a unique code.",
          onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
          onCancel: () => setModalConfig((prev) => ({ ...prev, isOpen: false })), // ✅ Add this
        });
      }


      // Confirm changing subject code
      return setModalConfig({
        isOpen: true,
        title: "Confirm Subject Code Change",
        message: "You are changing the subject code. This will create a new record and delete the old one. Continue?",
        onConfirm: async () => {
          try {
            const oldRef = doc(db, "subjectList", subjectId);
            const newRef = doc(db, "subjectList", subjectCode);
            await setDoc(newRef, editingSubjectData);
            await deleteDoc(oldRef);
            setSubjectData(editingSubjectData);
            setIsEditing(false);
            navigate(`/admin/subjects/${subjectCode}`);
          } catch (err) {
            console.error("Subject code update failed:", err);
          } finally {
            setModalConfig((prev) => ({ ...prev, isOpen: false }));
          }
        },
        onCancel: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
      });
    }

    // Subject code not changed: always confirm before saving
    setModalConfig({
      isOpen: true,
      title: "Confirm Save",
      message: "Are you sure you want to save changes to this subject?",
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "subjectList", subjectId), editingSubjectData);
          setSubjectData(editingSubjectData);
          setIsEditing(false);
        } catch (err) {
          console.error("Error saving subject:", err);
        } finally {
          setModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
      onCancel: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
    });
  };



  const filteredStudents = students.filter((student) =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.id.includes(searchQuery)
  );

  return (
    <div className="min-h-screen bg-white">
      {showModal && (
        <AddStudent
          onClose={() => {
            setShowModal(false);
            setEditingStudent(null);
          }}
          onAdd={handleAddOrUpdateStudent}
          initialData={editingStudent}
          subjectID={subjectId}
          validStudentIDs={allStudents.map(s => s.id)} // ✅ NEW PROP
          role={role} // ✅ required to conditionally allow
        />
      )}

      <div className="flex justify-between items-center p-4 shadow bg-blue sticky top-0 z-10">
        <button
          onClick={handleBack}
          className="text-white text-3xl font-bold hover:underline transition"
        >
          ←
        </button>
        <span className="text-sm text-white opacity-0 cursor-default">&nbsp;</span>
      </div>

      <div className="p-6">
        <h1 className="text-3xl font-bold text-black mb-6">Class List</h1>

        <div className="bg-gray-100 p-4 rounded-lg shadow mb-6">
          {loading ? (
            <p className="text-gray-500">Loading subject data...</p>
          ) : subjectData ? (
            <div className="flex flex-col md:flex-row justify-between items-start md:items-start">
              <div className="space-y-2 text-black w-full md:w-2/3">
                {isEditing ? (
                  <>
                    <div>
                      <strong>Program:</strong>
                      <input
                        type="text"
                        value={editingSubjectData.program || ""}
                        onChange={(e) => setEditingSubjectData(prev => ({ ...prev, program: e.target.value }))}
                        className="ml-2 border p-1 rounded"
                      />
                    </div>
                    <div>
                      <strong>Subject:</strong>
                      <input
                        type="text"
                        value={editingSubjectData.subject || ""}
                        onChange={(e) => setEditingSubjectData(prev => ({ ...prev, subject: e.target.value }))}
                        className="ml-2 border p-1 rounded"
                      />
                    </div>
                    <div>
                      <strong>Subject Code:</strong>
                      <input
                        type="text"
                        value={editingSubjectData.subjectCode || ""}
                        onChange={(e) => setEditingSubjectData(prev => ({ ...prev, subjectCode: e.target.value }))}
                        className="ml-2 border p-1 rounded"
                      />
                    </div>
                    <div>
                      <strong>Year Level:</strong>
                      <select
                        value={editingSubjectData.yearLevel || ""}
                        onChange={(e) => setEditingSubjectData(prev => ({ ...prev, yearLevel: e.target.value }))}
                        className="ml-2 border p-1 rounded"
                      >
                        <option value="">Select Year</option>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                      </select>
                    </div>
                    <div>
                      <strong>Semester:</strong>
                      <select
                        value={editingSubjectData.semester || ""}
                        onChange={(e) => setEditingSubjectData(prev => ({ ...prev, semester: e.target.value }))}
                        className="ml-2 border p-1 rounded"
                      >
                        <option value="">Select Semester</option>
                        <option value="1st Semester">1st Semester</option>
                        <option value="2nd Semester">2nd Semester</option>
                      </select>
                    </div>
                    <div>
                      <strong>Time:</strong>
                      <input
                        type="time"
                        value={editingSubjectData.startTime || ""}
                        onChange={(e) => setEditingSubjectData(prev => ({ ...prev, startTime: e.target.value }))}
                        className="ml-2 border p-1 rounded"
                      />
                      -
                      <input
                        type="time"
                        value={editingSubjectData.endTime || ""}
                        onChange={(e) => setEditingSubjectData(prev => ({ ...prev, endTime: e.target.value }))}
                        className="ml-2 border p-1 rounded"
                      />
                    </div>
                    <div>
                      <strong>School Year:</strong> {editingSubjectData.schoolYearStart} - {editingSubjectData.schoolYearEnd}
                    </div>
                  </>
                ) : (
                  <>
                    <div><strong>Program:</strong> {subjectData.program}</div>
                    <div><strong>Subject:</strong> {subjectData.subject}</div>
                    <div><strong>Subject Code:</strong> {subjectData.subjectCode}</div>
                    <div><strong>Year Level:</strong> {subjectData.yearLevel}</div>
                    <div><strong>Semester:</strong> {subjectData.semester}</div>
                    <div><strong>Time:</strong> {subjectData.startTime} - {subjectData.endTime}</div>
                    <div><strong>School Year:</strong> {subjectData.schoolYearStart} - {subjectData.schoolYearEnd}</div>
                  </>
                )}
                <div>
                  <strong>Instructor{assignedInstructors.length !== 1 ? "s" : ""}:</strong>{" "}
                  {assignedInstructors.length > 0
                    ? assignedInstructors.map((i) => i.name || i.instructorName || i.id).join(", ")
                    : "None assigned"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-4 mt-4 md:mt-0">
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 w-64"
                />
                {isEditing ? (
                  <div className="flex gap-2">
                    <button onClick={handleSaveSubject} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                      <FaSave className="inline mr-2" /> Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingSubjectData(subjectData);
                        setIsEditing(false);
                      }}
                      className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={handleEditToggle} className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-800">
                    <FaPen className="inline mr-2" /> Edit
                  </button>
                )}
                <button
                  className="bg-blue-700 text-white font-medium px-6 py-2 rounded-md hover:bg-blue-800"
                  onClick={() => setShowModal(true)}
                >
                  Add Student
                </button>
              </div>
            </div>
          ) : (
            <p className="text-red-500">Subject not found.</p>
          )}
        </div>

        <div className="overflow-x-auto shadow rounded-lg">
          <table className="min-w-full table-auto border border-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="py-2 px-4 border">Student ID</th>
                <th className="py-2 px-4 border">Full Name</th>
                <th className="py-2 px-4 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => (
                  <tr key={student.id} className={`text-center ${!student.valid ? "bg-red-100" : ""}`}>
                    <td className="py-2 px-4 border">{student.id}</td>
                    <td className="py-2 px-4 border">
                      {student.valid ? (
                        <Link to={`/students/${student.id}`} className="text-blue hover:underline">
                          {student.name}
                        </Link>
                      ) : (
                        <span className="text-red-500 italic">{student.name}</span>
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
              ) : (
                <tr>
                  <td colSpan="3" className="py-4 border text-center text-gray-500 italic">
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onCancel={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={modalConfig.onConfirm}
      />
    </div>
  );
};

export default ClassList;

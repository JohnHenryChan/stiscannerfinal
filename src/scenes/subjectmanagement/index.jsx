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
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";

const SubjectManagement = () => {
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [isSubjectOpen, setIsSubjectOpen] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [editingData, setEditingData] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState("All Programs");
  const [selectedSY, setSelectedSY] = useState("All School Years");
  const [selectedYearLevel, setSelectedYearLevel] = useState("All Year Levels");
  const [selectedSemester, setSelectedSemester] = useState("All Semesters");
  const [showImportModal, setShowImportModal] = useState(false);

  // Confirm delete modal state
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [subjectToDeleteIndex, setSubjectToDeleteIndex] = useState(null);

  // 🔹 Fetch subjects from Firestore
  useEffect(() => {
    let unsubscribe;

    const fetchSubjects = async () => {
      if (!user) return;

      if (user.role === "admin" || user.role === "registrar") {
        unsubscribe = onSnapshot(collection(db, "subjectList"), (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            ...doc.data(),
            id: doc.id,
          }));
          setSubjects(data);
        });
      } else {
        const instructorsSnap = await getDocs(collection(db, "instructors"));
        const instructorDoc = instructorsSnap.docs.find(
          (doc) => doc.data().uid === user.uid
        );

        if (!instructorDoc) {
          setSubjects([]);
          return;
        }

        const instructorData = instructorDoc.data();
        const subjectList = Array.isArray(instructorData.subjectList)
          ? instructorData.subjectList
          : [];

        if (subjectList.length === 0) {
          setSubjects([]);
          return;
        }

        unsubscribe = onSnapshot(collection(db, "subjectList"), (snapshot) => {
          const filtered = snapshot.docs
            .filter((doc) => subjectList.includes(doc.id))
            .map((doc) => ({
              ...doc.data(),
              id: doc.id,
            }));
          setSubjects(filtered);
        });
      }
    };

    fetchSubjects();
    return () => unsubscribe && unsubscribe();
  }, [user]);

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

  const handleSubjectSubmit = (data) => {
    setIsSubjectOpen(false);
    const subjectID = data.subjectCode;
    setDoc(doc(db, "subjectList", subjectID), data, { merge: true });
    setEditingData(null);
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
              {user?.role === "admin" && (
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
                  {user?.role === "admin" && (
                    <>
                      <th className="py-2 px-4 border">Status</th>
                      <th className="py-2 px-4 border">Action</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {filteredSubjects.length > 0 ? (
                  filteredSubjects.map((subj, index) => (
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

                      {user?.role === "admin" && (
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
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="8"
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
        </div>
      </div>
    </div>
  );
};

export default SubjectManagement;

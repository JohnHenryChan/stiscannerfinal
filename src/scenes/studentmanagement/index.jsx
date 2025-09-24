// StudentManagement.jsx
import React, { useState, useEffect } from 'react';
import SidebarAdmin from '../global/SidebarAdmin';
import TopbarAdmin from '../global/TopbarAdmin';
import { MdSearch, MdEdit, MdDelete } from "react-icons/md";
import { db } from '../../firebaseConfig';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import AddStudent from '../../components/AddStudent';
import ImportModal from '../../components/ImportModal';

const StudentManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [students, setStudents] = useState([]);
  const [editingStudent, setEditingStudent] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Fetch all students
  const fetchStudents = async () => {
    const snapshot = await getDocs(collection(db, "students"));
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setStudents(data);
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // Delete student
  const handleDelete = async (studentId) => {
    await deleteDoc(doc(db, "students", studentId));
    setStudents(prev => prev.filter(student => student.id !== studentId));
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

  // Search filter
  const filteredStudents = students.filter(
    (student) =>
      (student.firstName + " " + student.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.id.includes(searchTerm)
  );

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

          {/* Student Table */}
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black px-4 py-2">ID</th>
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
                        onClick={() => handleDelete(student.id)}
                      >
                        <MdDelete size={20} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-gray-500 italic">
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
        </div>
      </div>
    </div>
  );
};

export default StudentManagement;

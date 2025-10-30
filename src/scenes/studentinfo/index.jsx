import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import TopbarAdmin from "../global/TopbarAdmin";
import SidebarAdmin from "../global/SidebarAdmin";

const StudentInformation = () => {
  const { studentId: paramStudentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [studentId, setStudentId] = useState(location.state?.studentId || paramStudentId);
  const [student, setStudent] = useState(null);
  const [loadingStudent, setLoadingStudent] = useState(true);
  const [error, setError] = useState(null);

  const [studentSubjects, setStudentSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  useEffect(() => {
    if (location.state?.studentId && location.state.studentId !== studentId) {
      setStudentId(location.state.studentId);
    }
  }, [location.state, studentId]);

  useEffect(() => {
    let cancelled = false;
    const fetchStudent = async () => {
      setLoadingStudent(true);
      setError(null);
      try {
        if (!studentId) {
          setStudent(null);
          setLoadingStudent(false);
          return;
        }
        const sRef = doc(db, "students", String(studentId));
        const sSnap = await getDoc(sRef);
        if (!cancelled) {
          setStudent(sSnap.exists() ? { id: sSnap.id, ...(sSnap.data() || {}) } : null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoadingStudent(false);
      }
    };
    fetchStudent();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    const fetchStudentSubjects = async () => {
      setLoadingSubjects(true);
      setStudentSubjects([]);
      
      if (!studentId) {
        setLoadingSubjects(false);
        return;
      }

      try {
        console.log("[StudentInfo] Fetching subjects for student:", studentId);
        
        // Get all subjects from subjectList collection
        const subjectsSnap = await getDocs(collection(db, "subjectList"));
        const enrolledSubjects = [];

        // Check each subject to see if this student is enrolled
        for (const subjectDoc of subjectsSnap.docs) {
          try {
            const subjectData = subjectDoc.data();
            const subjectId = subjectDoc.id;
            
            // Check if student exists in this subject's students subcollection
            const studentInSubjectRef = doc(db, "subjectList", subjectId, "students", String(studentId));
            const studentInSubjectSnap = await getDoc(studentInSubjectRef);
            
            if (studentInSubjectSnap.exists()) {
              // Student is enrolled in this subject
              const enrollmentData = {
                id: subjectId,
                subjectCode: subjectData.subjectCode || subjectId,
                subject: subjectData.subject || subjectData.name || "Unknown Subject",
                program: subjectData.program || "—",
                yearLevel: subjectData.yearLevel || "—",
                semester: subjectData.semester || "—",
                startTime: subjectData.startTime || "—",
                endTime: subjectData.endTime || "—",
                schoolYearStart: subjectData.schoolYearStart || "—",
                schoolYearEnd: subjectData.schoolYearEnd || "—",
                days: subjectData.days || subjectData.schedule || "—",
                // For sorting purposes
                sortTime: parseTime(subjectData.startTime)
              };
              
              enrolledSubjects.push(enrollmentData);
              console.log("[StudentInfo] Found enrollment in subject:", subjectId, enrollmentData);
            }
          } catch (err) {
            console.warn(`[StudentInfo] Error checking subject ${subjectDoc.id}:`, err);
          }
        }

        // Sort by start time (earliest first)
        enrolledSubjects.sort((a, b) => {
          if (a.sortTime === null && b.sortTime === null) return 0;
          if (a.sortTime === null) return 1; // null values go to end
          if (b.sortTime === null) return -1;
          return a.sortTime - b.sortTime;
        });

        console.log("[StudentInfo] Final enrolled subjects:", enrolledSubjects);
        
        if (!cancelled) {
          setStudentSubjects(enrolledSubjects);
        }
      } catch (err) {
        console.error("[StudentInfo] Failed to fetch student subjects:", err);
        if (!cancelled) {
          setStudentSubjects([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSubjects(false);
        }
      }
    };

    fetchStudentSubjects();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Helper function to parse time string to minutes for sorting
  const parseTime = (timeStr) => {
    if (!timeStr || timeStr === "—") return null;
    const [hours, minutes] = timeStr.split(":").map(num => parseInt(num, 10));
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };

  // Helper function to format time range
  const formatTimeRange = (startTime, endTime) => {
    if (!startTime && !endTime) return "—";
    if (!startTime || startTime === "—") return endTime || "—";
    if (!endTime || endTime === "—") return startTime || "—";
    return `${startTime} - ${endTime}`;
  };

  const initials = (s) => {
    const fn = s?.firstName || "";
    const ln = s?.lastName || "";
    if (!fn && !ln && s?.name) {
      const parts = s.name.split(" ");
      return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
    }
    return (fn[0] || "") + (ln[0] || "");
  };

  return (
    <div className="min-h-screen bg-white">
      <TopbarAdmin />
      <div className="flex">
        <SidebarAdmin />

        <main className="flex-1 p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-4">
              <button className="text-2xl font-bold text-blue-700" onClick={() => navigate(-1)}>←</button>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-700">
                  {student ? initials(student).toUpperCase() : "?"}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{student ? (student.name || `${student.firstName || ""} ${student.lastName || ""}`) : "Student"}</h1>
                  <div className="text-sm text-gray-600">ID: {student?.id || studentId || "—"}</div>
                </div>
              </div>
            </div>
          </div>

          <section className="bg-gray-100 p-4 rounded-lg shadow mb-6">
            <h2 className="font-semibold mb-3">Student Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-black">
              <div><strong>RFID:</strong> {student?.rfid || "—"}</div>
              <div><strong>Year:</strong> {student?.year || student?.yearLevel || "—"}</div>
              <div><strong>Program:</strong> {student?.program || "—"}</div>
              <div><strong>Contact:</strong> {student?.contact || "—"}</div>
              <div><strong>Guardian:</strong> {student?.guardian || "—"}</div>
              <div><strong>Guardian Contact:</strong> {student?.guardianContact || "—"}</div>
            </div>
          </section>

          <section className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Enrolled Subjects</h3>
              <div className="text-sm text-gray-600">
                {loadingSubjects ? "Loading..." : `${studentSubjects.length} subject(s)`}
              </div>
            </div>

            {loadingSubjects ? (
              <div className="text-center py-8 text-gray-500">Loading enrolled subjects...</div>
            ) : studentSubjects.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No subjects found for this student.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto border border-gray-200 text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-3 px-4 border text-left">Subject Code</th>
                      <th className="py-3 px-4 border text-left">Subject Name</th>
                      <th className="py-3 px-4 border text-left">Program</th>
                      <th className="py-3 px-4 border text-left">Year Level</th>
                      <th className="py-3 px-4 border text-left">Semester</th>
                      <th className="py-3 px-4 border text-left">Schedule</th>
                      <th className="py-3 px-4 border text-left">School Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentSubjects.map((subject, idx) => (
                      <tr key={subject.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">
                          <button
                            onClick={() => navigate(`/admin/subjects/${subject.id}`)}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {subject.subjectCode}
                          </button>
                        </td>
                        <td className="py-3 px-4">{subject.subject}</td>
                        <td className="py-3 px-4">{subject.program}</td>
                        <td className="py-3 px-4">{subject.yearLevel}</td>
                        <td className="py-3 px-4">{subject.semester}</td>
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-medium">{formatTimeRange(subject.startTime, subject.endTime)}</div>
                            {subject.days && subject.days !== "—" && (
                              <div className="text-xs text-gray-500">{subject.days}</div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {subject.schoolYearStart && subject.schoolYearEnd && 
                           subject.schoolYearStart !== "—" && subject.schoolYearEnd !== "—"
                            ? `${subject.schoolYearStart}-${subject.schoolYearEnd}`
                            : "—"
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default StudentInformation;

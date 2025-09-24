import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { loadFaceModels } from "./utils/faceApiLoader";
import React, { useEffect} from "react";

// Scenes
import Login from "./scenes/login";
import Dashboard from "./scenes/dashboard";
import AttendanceRecord from "./scenes/attendancerecord";
import StudentManagement from "./scenes/studentmanagement";
import Teachermanagement from "./scenes/teachermanangement";
import Settings from "./scenes/settings";
import Helps from "./scenes/helpsupport";
import Admin from "./scenes/adminprofile";
import Notification from "./scenes/notification";
import Profilesettings from "./scenes/profilesettings";
import Subject from "./scenes/subjectmanagement";
import ClassList from "./scenes/classlist";
import StudentInformation from "./scenes/studentinfo";
import IDScanner from "./scenes/idscannerr";
import FaceId from "./scenes/scanface";
import PasswordReset from "./scenes/passwordreset";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/passwordChange" replace />;

  return children;
}

function App() {
  const { loading, user } = useAuth();

  useEffect(() => {
    const initModels = async () => {
      try {
        await loadFaceModels();
      } catch (err) {
        console.error("Failed to load face models:", err);
      }
    };
    initModels();
  }, []);

  if (loading) return null;

  return (
    <div className="app">
      <main className="content">
        <Routes>
          {/* Public Routes */}
          <Route path="/scanner" element={<IDScanner />} />
          <Route path="/login" element={<Login />} />
          <Route path="/passwordChange" element={<PasswordReset />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/studentlist"
            element={
              <ProtectedRoute>
                <StudentManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendancerecord"
            element={
              <ProtectedRoute>
                <AttendanceRecord />
              </ProtectedRoute>
            }
          />
          <Route
            path="/studentmanagement"
            element={
              <ProtectedRoute>
                <StudentManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teachermanagement"
            element={
              <ProtectedRoute>
                <Teachermanagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/helps"
            element={
              <ProtectedRoute>
                <Helps />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subjectmanagement"
            element={
              <ProtectedRoute>
                <Subject />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/subjects/:subjectId"
            element={
              <ProtectedRoute>
                <ClassList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/students/:studentId"
            element={
              <ProtectedRoute>
                <StudentInformation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/adminprofile"
            element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notification"
            element={
              <ProtectedRoute>
                <Notification />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profilesettings"
            element={
              <ProtectedRoute>
                <Profilesettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan"
            element={
              <ProtectedRoute>
                <FaceId />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

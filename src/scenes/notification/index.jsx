import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  where
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";

const Notification = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  console.log("🔔 [Notifications] Component rendered");
  console.log("👤 [Notifications] Current user:", user);

  const handleBack = () => {
    console.log("⬅️ [Notifications] Navigating back");
    navigate(-1);
  };

  const markAllAsRead = async () => {
    console.log("✅ [Notifications] Marking all as read...");
    try {
      const unreadNotifs = notifications.filter(n => !n.resolved);
      console.log("📊 [Notifications] Unread notifications count:", unreadNotifs.length);
      
      const batch = [];

      for (const notif of unreadNotifs) {
        const notifRef = doc(db, "notifications", notif.id);
        batch.push(updateDoc(notifRef, { resolved: true }));
      }

      await Promise.all(batch);
      console.log("✅ [Notifications] Successfully marked all as read");

      // Update local state
      setNotifications(prev =>
        prev.map(n => ({ ...n, resolved: true }))
      );
    } catch (error) {
      console.error("🔥 [Notifications] Failed to mark notifications as read:", error);
    }
  };

  const markAsResolved = async (notificationId) => {
    console.log("✅ [Notifications] Marking notification as resolved:", notificationId);
    try {
      const notifRef = doc(db, "notifications", notificationId);
      await updateDoc(notifRef, { resolved: true });
      console.log("✅ [Notifications] Successfully marked notification as resolved");

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, resolved: true } : n)
      );
    } catch (error) {
      console.error("🔥 [Notifications] Failed to resolve notification:", error);
    }
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      console.log("📥 [Notifications] Starting to fetch notifications...");
      
      if (!user) {
        console.warn("❌ [Notifications] No user found, skipping fetch");
        setLoading(false);
        return;
      }

      console.log("👤 [Notifications] User role:", user.role);
      console.log("🆔 [Notifications] User ID:", user.uid);

      try {
        // Build query based on user role
        let q;
        
        if (user.role === 'admin' || user.role === 'guidance') {
          console.log("👑 [Notifications] Admin/Guidance user - fetching all notifications");
          // Admin and guidance see all notifications
          q = query(
            collection(db, "notifications"),
            orderBy("createdAt", "desc")
          );
        } else if (user.role === 'instructor') {
          console.log("👨‍🏫 [Notifications] Instructor user - fetching subject-specific notifications");
          // Instructors only see notifications for their subjects
          q = query(
            collection(db, "notifications"),
            where("instructorId", "==", user.uid),
            where("type", "==", "absent3_subject"), // Only subject-level notifications
            orderBy("createdAt", "desc")
          );
        } else {
          console.log("🚫 [Notifications] Registrar or other role - no notifications");
          // Registrars and others see no notifications
          setNotifications([]);
          setLoading(false);
          return;
        }

        console.log("🔍 [Notifications] Executing query...");
        const snapshot = await getDocs(q);
        console.log("📊 [Notifications] Raw notifications count:", snapshot.size);
        
        const notifData = [];

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          console.log("📋 [Notifications] Processing notification:", {
            id: docSnap.id,
            type: data.type,
            studentId: data.studentId,
            subjectId: data.subjectId,
            instructorId: data.instructorId,
            resolved: data.resolved
          });

          let studentName = "Unknown Student";
          let subjectName = data.subjectId || "";

          // Fetch student name
          try {
            console.log("👤 [Notifications] Fetching student name for:", data.studentId);
            const studentDoc = await getDocs(
              query(collection(db, "students"), where("id", "==", data.studentId))
            );
            if (!studentDoc.empty) {
              const student = studentDoc.docs[0].data();
              studentName = `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
                          student.name || data.studentId;
              console.log("✅ [Notifications] Found student name:", studentName);
            } else {
              console.warn("⚠️ [Notifications] Student not found:", data.studentId);
            }
          } catch (err) {
            console.error("🔥 [Notifications] Failed to fetch student name:", err);
          }

          // Fetch subject name if applicable
          if (data.subjectId) {
            try {
              console.log("📚 [Notifications] Fetching subject name for:", data.subjectId);
              const subjectRef = doc(db, "subjectList", data.subjectId);
              const subjectSnap = await getDocs(query(collection(db, "subjectList"), where("__name__", "==", data.subjectId)));
              
              if (!subjectSnap.empty) {
                const subject = subjectSnap.docs[0].data();
                subjectName = subject.name || subject.subject || subject.subjectName || data.subjectId;
                console.log("✅ [Notifications] Found subject name:", subjectName);
              } else {
                console.warn("⚠️ [Notifications] Subject not found:", data.subjectId);
              }
            } catch (err) {
              console.error("🔥 [Notifications] Failed to fetch subject name:", err);
            }
          }

          notifData.push({
            id: docSnap.id,
            ...data,
            studentName,
            subjectName,
            createdAt: data.createdAt?.toDate() || new Date()
          });
        }

        console.log("📊 [Notifications] Final processed notifications:", notifData.length);
        console.log("📋 [Notifications] Notification types:", notifData.map(n => n.type));
        
        setNotifications(notifData);
      } catch (error) {
        console.error("🔥 [Notifications] Failed to fetch notifications:", error);
      } finally {
        setLoading(false);
        console.log("🏁 [Notifications] Fetch completed");
      }
    };

    fetchNotifications();
  }, [user]);

  // Group notifications by date
  const groupedNotifications = notifications.reduce((groups, notification) => {
    const date = notification.createdAt;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let groupKey;
    if (date.toDateString() === today.toDateString()) {
      groupKey = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = "Yesterday";
    } else {
      groupKey = date.toLocaleDateString();
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(notification);

    return groups;
  }, {});

  console.log("📊 [Notifications] Grouped notifications:", Object.keys(groupedNotifications));

  const getNotificationIcon = (type) => {
    switch (type) {
      case "absent3_subject":
        return "⚠️";
      case "absent3_global":
        return "🚨";
      default:
        return "📢";
    }
  };

  const getNotificationMessage = (notification) => {
    console.log("💬 [Notifications] Generating message for type:", notification.type);
    switch (notification.type) {
      case "absent3_subject":
        return `${notification.studentName} has been absent for 3 consecutive days in ${notification.subjectName}`;
      case "absent3_global":
        return `${notification.studentName} has been absent from ALL classes for 3 consecutive days`;
      default:
        return "New notification";
    }
  };

  if (loading) {
    console.log("⏳ [Notifications] Still loading...");
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading notifications...</div>
      </div>
    );
  }

  console.log("🎨 [Notifications] Rendering notification page with", notifications.length, "notifications");

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar */}
      <div className="flex justify-between items-center p-4 shadow bg-blue sticky top-0 z-10">
        <button
          onClick={handleBack}
          className="text-white text-3xl font-bold hover:underline transition"
        >
          ←
        </button>

        {notifications.some(n => !n.resolved) && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-white hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="p-6">
        <h1 className="text-3xl font-bold text-black mb-6">
          Notifications
          {user?.role && (
            <span className="text-sm text-gray-500 ml-2">({user.role})</span>
          )}
        </h1>

        {notifications.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-lg">
              {user?.role === 'registrar' 
                ? "Registrars do not receive notifications" 
                : "No notifications yet"}
            </p>
          </div>
        ) : (
          Object.entries(groupedNotifications).map(([date, notifs]) => (
            <div key={date} className="space-y-2 mb-6">
              <p className="text-gray-600 font-semibold">{date}</p>

              {notifs.map((notification) => (
                <div
                  key={notification.id}
                  className={`border rounded-md p-4 transition-all duration-200 ${
                    notification.resolved
                      ? "bg-gray-50 border-gray-200"
                      : notification.type.includes("absent3")
                        ? "bg-red-50 border-red-200"
                        : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                        <p className={`font-semibold ${
                          notification.type.includes("absent3") ? "text-red-600" : "text-gray-700"
                        }`}>
                          {notification.type.includes("absent3") ? "Attendance Alert!" : "Notification"}
                        </p>
                        {!notification.resolved && (
                          <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                            New
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-700 mb-2">
                        {getNotificationMessage(notification)}
                      </p>

                      <div className="text-xs text-gray-500">
                        Date: {notification.date} |
                        Time: {notification.createdAt.toLocaleTimeString()}
                        {notification.subjectId && (
                          <> | Subject: {notification.subjectName}</>
                        )}
                      </div>
                    </div>

                    {!notification.resolved && (
                      <button
                        onClick={() => markAsResolved(notification.id)}
                        className="ml-4 text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Notification;

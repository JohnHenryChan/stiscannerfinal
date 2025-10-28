// components/TopbarAdmin.jsx
import React, { useEffect, useState } from "react";
import { Avatar, Box, IconButton, Typography, Button } from "@mui/material";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebaseConfig";
import { collection, query, where, getDocs } from "firebase/firestore";

const TopbarAdmin = () => {
  const navigate = useNavigate();
  const { displayName, user } = useAuth();
  const [avatarSrc, setAvatarSrc] = useState("/path-to-avatar.png");
  const [notificationCount, setNotificationCount] = useState(0);

  console.log("🔔 [TopbarAdmin] Component rendered");
  console.log("👤 [TopbarAdmin] Current user:", user);
  console.log("🏷️ [TopbarAdmin] Display name:", displayName);

  // Fetch avatar (existing functionality)
  useEffect(() => {
    let mounted = true;
    const fetchAvatar = async () => {
      if (!user?.uid) return;
      try {
        console.log("🖼️ [TopbarAdmin] Fetching avatar for user:", user.uid);
        // try to find instructor document by uid and use its photoURL
        const q = query(collection(db, "instructors"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!mounted) return;
        if (!snap.empty) {
          const data = snap.docs[0].data() || {};
          if (data.photoURL) {
            console.log("✅ [TopbarAdmin] Found instructor avatar:", data.photoURL);
            setAvatarSrc(data.photoURL);
            return;
          }
        }
        // fallback to auth user photoURL if available
        if (user.photoURL) {
          console.log("✅ [TopbarAdmin] Using auth user avatar:", user.photoURL);
          setAvatarSrc(user.photoURL);
        }
      } catch (err) {
        console.error("🔥 [TopbarAdmin] Failed to load avatar for topbar:", err);
      }
    };

    fetchAvatar();
    return () => {
      mounted = false;
    };
  }, [user]);

  // Fetch notification count (new functionality)
  useEffect(() => {
    const fetchNotificationCount = async () => {
      console.log("📊 [TopbarAdmin] Starting notification count fetch...");

      if (!user) {
        console.warn("❌ [TopbarAdmin] No user found, skipping count fetch");
        setNotificationCount(0);
        return;
      }

      console.log("👤 [TopbarAdmin] User role:", user.role);
      console.log("🆔 [TopbarAdmin] User ID:", user.uid);

      // Hide notifications for registrars
      if (user.role === "registrar") {
        console.log("🚫 [TopbarAdmin] Registrar user - hiding notifications");
        setNotificationCount(0);
        return;
      }

      try {
        let q;

        if (user.role === "admin" || user.role === "guidance") {
          console.log(
            "👑 [TopbarAdmin] Admin/Guidance user - counting all unread notifications"
          );
          // Admin and guidance see all unread notifications
          q = query(
            collection(db, "notifications"),
            where("resolved", "==", false)
          );
        } else if (user.role === "instructor") {
          console.log(
            "👨‍🏫 [TopbarAdmin] Instructor user - counting subject-specific unread notifications"
          );
          // Instructors only see unread notifications for their subjects
          q = query(
            collection(db, "notifications"),
            where("resolved", "==", false),
            where("instructorId", "==", user.uid),
            where("type", "==", "absent3_subject")
          );
        } else {
          console.log("🚫 [TopbarAdmin] Other role - no notifications");
          setNotificationCount(0);
          return;
        }

        console.log("🔍 [TopbarAdmin] Executing count query...");
        const snapshot = await getDocs(q);
        const count = snapshot.size;

        console.log("📊 [TopbarAdmin] Raw notification count:", count);
        const displayCount = count > 15 ? 15 : count;
        console.log("📊 [TopbarAdmin] Display count:", displayCount);

        setNotificationCount(displayCount);
      } catch (error) {
        console.error("🔥 [TopbarAdmin] Failed to fetch notification count:", error);
        setNotificationCount(0);
      }
    };

    fetchNotificationCount();

    // Refresh count every 30 seconds
    const interval = setInterval(() => {
      console.log("⏰ [TopbarAdmin] Refreshing notification count...");
      fetchNotificationCount();
    }, 30000);

    return () => {
      console.log("🧹 [TopbarAdmin] Cleaning up notification count interval");
      clearInterval(interval);
    };
  }, [user]);

  // Navigation handlers
  const handleLogoClick = () => {
    console.log("🏠 [TopbarAdmin] Logo clicked - navigating to dashboard");
    navigate("/dashboard");
  };

  const handleAdminClick = () => {
    console.log("👤 [TopbarAdmin] Admin profile clicked - navigating to profile");
    navigate("/adminprofile");
  };

  const handleNotificationClick = () => {
    console.log("🔔 [TopbarAdmin] Notification icon clicked - navigating to notifications");
    navigate("/notification");
  };

  // Don't render notification icon for registrars
  const shouldShowNotificationIcon = user && user.role !== "registrar";
  console.log("👁️ [TopbarAdmin] Should show notification icon:", shouldShowNotificationIcon);

  return (
    <Box
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      p={2}
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        bgcolor: "#0057A4",
        borderBottom: "3px solid #ddd",
      }}
    >
      {/* Logo - Clickable to navigate to dashboard */}
      <Box 
        sx={{ 
          cursor: "pointer",
          transition: "opacity 0.2s ease",
          "&:hover": {
            opacity: 0.8
          }
        }} 
        onClick={handleLogoClick}
      >
        <img 
          src="/stilogoo.png" 
          alt="STI Logo" 
          style={{ height: "60px" }}
        />
      </Box>

      <Box display="flex" alignItems="center" sx={{ marginLeft: "auto" }}>
        {/* Home Icon - Additional navigation option */}
        <IconButton 
          sx={{ 
            color: "white",
            "&:hover": {
              backgroundColor: "rgba(255,255,255,0.1)"
            }
          }} 
          onClick={handleLogoClick}
          title="Go to Dashboard"
        >
          <HomeOutlinedIcon sx={{ fontSize: 28 }} />
        </IconButton>

        {/* Notification Icon with Badge - Hidden for registrars */}
        {shouldShowNotificationIcon && (
          <Box sx={{ position: "relative", marginLeft: 1 }}>
            <IconButton 
              sx={{ 
                color: "white",
                "&:hover": {
                  backgroundColor: "rgba(255,255,255,0.1)"
                }
              }} 
              onClick={handleNotificationClick}
              title="View Notifications"
            >
              <NotificationsOutlinedIcon sx={{ fontSize: 35 }} />
            </IconButton>

            {/* Badge - Only show if count > 0 */}
            {notificationCount > 0 && (
              <Box
                sx={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  backgroundColor: "#ff4444",
                  color: "white",
                  fontSize: "10px",
                  borderRadius: "50%",
                  minWidth: "20px",
                  height: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                  border: "2px solid white",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  animation: notificationCount > 0 ? "pulse 2s infinite" : "none",
                  "@keyframes pulse": {
                    "0%": {
                      transform: "scale(1)",
                    },
                    "50%": {
                      transform: "scale(1.1)",
                    },
                    "100%": {
                      transform: "scale(1)",
                    },
                  },
                }}
              >
                {notificationCount > 15 ? "15+" : notificationCount}
              </Box>
            )}
          </Box>
        )}

        {/* Divider */}
        <Box
          sx={{
            width: "2px",
            height: "50px",
            backgroundColor: "white",
            margin: "0 10px",
          }}
        />

        {/* User Profile Button - Existing functionality preserved */}
        <Button
          onClick={handleAdminClick}
          variant="contained"
          sx={{
            backgroundColor: "#90A4AE",
            textTransform: "none",
            borderRadius: "20px",
            padding: "5px 10px",
            color: "black",
            "&:hover": {
              backgroundColor: "#78909C",
              transform: "translateY(-1px)",
              boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
            },
            transition: "all 0.2s ease",
          }}
          title="View Profile"
        >
          <Avatar 
            src={avatarSrc} 
            sx={{ 
              width: 32, 
              height: 32, 
              marginRight: 1,
              border: "1px solid rgba(0,0,0,0.1)",
            }} 
          />
          <Typography fontWeight="bold">{displayName || "Admin"}</Typography>
        </Button>
      </Box>
    </Box>
  );
};

export default TopbarAdmin;

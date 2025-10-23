// components/TopbarAdmin.jsx
import React, { useEffect, useState } from "react";
import { Avatar, Box, IconButton, Typography, Button } from "@mui/material";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebaseConfig";
import { collection, query, where, getDocs } from "firebase/firestore";

const TopbarAdmin = () => {
  const navigate = useNavigate();
  const { displayName, user } = useAuth();
  const [avatarSrc, setAvatarSrc] = useState("/path-to-avatar.png");

  useEffect(() => {
    let mounted = true;
    const fetchAvatar = async () => {
      if (!user?.uid) return;
      try {
        // try to find instructor document by uid and use its photoURL
        const q = query(collection(db, "instructors"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!mounted) return;
        if (!snap.empty) {
          const data = snap.docs[0].data() || {};
          if (data.photoURL) {
            setAvatarSrc(data.photoURL);
            return;
          }
        }
        // fallback to auth user photoURL if available
        if (user.photoURL) setAvatarSrc(user.photoURL);
      } catch (err) {
        console.error("Failed to load avatar for topbar:", err);
      }
    };

    fetchAvatar();
    return () => {
      mounted = false;
    };
  }, [user]);

  const handleAdminClick = () => {
    navigate("/adminprofile");
  };

  const handleNotificationClick = () => {
    navigate("/notification");
  };

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
      <Box>
        <img src="/stilogoo.png" alt="Logo" style={{ height: "60px" }} />
      </Box>

      <Box display="flex" alignItems="center" sx={{ marginLeft: "auto" }}>
        <IconButton sx={{ color: "white" }} onClick={handleNotificationClick}>
          <NotificationsOutlinedIcon sx={{ fontSize: 35 }} />
        </IconButton>

        <Box
          sx={{
            width: "2px",
            height: "50px",
            backgroundColor: "white",
            margin: "0 10px",
          }}
        />

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
            },
          }}
        >
          <Avatar src={avatarSrc} sx={{ width: 32, height: 32, marginRight: 1 }} />
          <Typography fontWeight="bold">{displayName || "Admin"}</Typography>
        </Button>
      </Box>
    </Box>
  );
};

export default TopbarAdmin;

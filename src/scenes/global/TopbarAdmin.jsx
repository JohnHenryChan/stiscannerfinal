// components/TopbarAdmin.jsx
import { Avatar, Box, IconButton, Typography, Button } from "@mui/material";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import { useNavigate } from "react-router-dom";

const TopbarAdmin = () => {
  const navigate = useNavigate();

  const handleAdminClick = () => {
    navigate("/adminprofile");
  };

  const handleNotificationClick = () => {
    navigate("/notification"); //  Added this to navigate to notification page
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
      {/* Logo */}
      <Box>
        <img src="/stilogoo.png" alt="Logo" style={{ height: "60px" }} />
      </Box>

      {/* Right-side */}
      <Box display="flex" alignItems="center" sx={{ marginLeft: "auto" }}>
        <IconButton sx={{ color: "white" }} onClick={handleNotificationClick}>
          {/* Added onClick to Notification Icon */}
          <NotificationsOutlinedIcon sx={{ fontSize: 35 }} />
        </IconButton>

        {/* Divider */}
        <Box
          sx={{
            width: "2px",
            height: "50px",
            backgroundColor: "white",
            margin: "0 10px",
          }}
        />

        {/* Admin Profile Button */}
        <Button
          onClick={handleAdminClick}
          variant="contained"
          sx={{
            backgroundColor: "#90A4AE",
            textTransform: "none",
            borderRadius: "20px",
            padding: "5px 10px",
            color: "black",
            '&:hover': {
              backgroundColor: "#78909C",
            },
          }}
        >
          <Avatar
            src="/path-to-avatar.png"
            sx={{ width: 32, height: 32, marginRight: 1 }}
          />
          <Typography fontWeight="bold">Admin</Typography>
        </Button>
      </Box>
    </Box>
  );
};

export default TopbarAdmin;

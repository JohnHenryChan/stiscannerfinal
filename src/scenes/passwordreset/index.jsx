import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
} from "@mui/material";
import { updatePassword } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";

const PasswordReset = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChangePassword = async () => {
    setError("");
    setSuccess("");

    if (!newPassword || !confirmPassword) {
      return setError("Both fields are required.");
    }

    if (newPassword !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    try {
      await updatePassword(auth.currentUser, newPassword);

      const q = query(collection(db, "instructors"), where("uid", "==", user.uid));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const instructorRef = snap.docs[0].ref;
        await updateDoc(instructorRef, { mustChangePassword: false });
      }

      setSuccess("Password updated successfully. Redirecting...");
      setTimeout(() => navigate("/dashboard"), 1000);
    } catch (err) {
      setError("Password update failed: " + err.message);
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      bgcolor="#f5f5f5"
    >
      <Paper
        elevation={3}
        sx={{ padding: 4, width: 400, display: "flex", flexDirection: "column" }}
      >
        <Typography variant="h5" fontWeight="bold" mb={3}>
          Change Your Password
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <TextField
          fullWidth
          label="New Password"
          type="password"
          variant="outlined"
          margin="normal"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <TextField
          fullWidth
          label="Confirm Password"
          type="password"
          variant="outlined"
          margin="normal"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <Button
          fullWidth
          variant="contained"
          sx={{ mt: 3, backgroundColor: "#0054a6" }}
          onClick={handleChangePassword}
        >
          Update Password
        </Button>
      </Paper>
    </Box>
  );
};

export default PasswordReset;
